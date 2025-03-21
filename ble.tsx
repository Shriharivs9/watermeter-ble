import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  StyleSheet,
} from "react-native";
import { BleManager, Device } from "react-native-ble-plx";
import { Buffer } from "buffer";

const BLEInterface = () => {
  const [bleManager] = useState(new BleManager());
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [deviceData, setDeviceData] = useState<any>(null);
  const [packetSequence, setPacketSequence] = useState<number>(0x40); // Start from 0x41 (65 decimal)

  useEffect(() => {
    if (Platform.OS === "android") {
      requestPermissions();
    }

    return () => {
      stopScan();
      bleManager.destroy();
    };
  }, []);

  useEffect(() => {
    if (connectedDevice) {
      const subscription = bleManager.onDeviceDisconnected(
        connectedDevice.id,
        () => {
          console.warn(`Device ${connectedDevice.name} disconnected unexpectedly.`);
          setConnectedDevice(null);
          setDeviceData(null);
        }
      );
      return () => subscription.remove();
    }
  }, [connectedDevice]);

  const requestPermissions = async () => {
    if (Platform.OS === "android") {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      if (granted["android.permission.ACCESS_FINE_LOCATION"] !== "granted") {
        console.warn("Location permission not granted");
      }
    }
  };

  const startScan = () => {
    if (isScanning) return;

    console.log("Starting BLE scan...");
    setIsScanning(true);
    setDevices([]); // Clear previously discovered devices
    const discoveredDeviceIds = new Set(); // Track discovered device IDs

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error("Scan error:", error.message);
        stopScan();
        return;
      }

      if (device && device.name && !discoveredDeviceIds.has(device.id)) {
        // Log and add only new devices
        console.log("Discovered device:", device.name, device.id);
        discoveredDeviceIds.add(device.id); // Mark device as discovered
        setDevices((prevDevices) => [...prevDevices, device]);
      }
    });

    setTimeout(() => stopScan(), 20000);
  };

  const stopScan = () => {
    console.log("Stopping BLE scan...");
    bleManager.stopDeviceScan();
    setIsScanning(false);
  };

  const connectToDevice = async (device: Device) => {
    try {
      console.log(`Attempting to connect to device: ${device.name} (${device.id})`);

      // Connect to the device
      const connectedDevice = await device.connect();
      console.log(`Successfully connected to device: ${connectedDevice.name} (${connectedDevice.id})`);

      // Request MTU size
      const mtu = await connectedDevice.requestMTU(247);
      console.log(`Negotiated MTU: ${mtu}`);

      // Wait for service discovery to complete
      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log("Services and characteristics discovered");

      // Set connected device
      setConnectedDevice(connectedDevice);
    } catch (error: any) {
      console.error(`Error connecting to device: ${device.id}`, error.message);
      if (connectedDevice) {
        console.warn("Cleaning up partial connection...");
        await disconnectDevice();
      }
    }
  };

  const fetchDeviceInformation = async (device: Device) => {
    try {
      const serviceUUID = "005a02fe-bea5-46a0-c000-73c0d9b578fc";
      const characteristicUUID = "005a02fe-bea5-46a0-c101-73c0d9b578fc";

      // Only implement battery voltage request for now
      const request = {
        name: 'BatteryVoltage',
        obisCode: '3:0-0:96.6.3*255:2',
        requestPacket: createDLMSRequest('3:0-0:96.6.3*255:2')
      };

      try {
        if (!(await device.isConnected())) {
          console.log("Device disconnected, reconnecting...");
          await device.connect();
          await device.discoverAllServicesAndCharacteristics();
          console.log("Reconnected successfully");
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log(`Sending battery voltage request`);
        
        // Convert request to base64
        const base64Request = Buffer.from(request.requestPacket).toString('base64');
        
        // Enable notifications first
        await device.monitorCharacteristicForService(
          serviceUUID,
          characteristicUUID,
          (error, characteristic) => {
            if (error) {
              console.error(`Notification error:`, error);
              return;
            }
            if (characteristic?.value) {
              const responseData = Buffer.from(characteristic.value, 'base64');
              console.log(`Received notification:`, responseData.toString('hex'));
              parseResponse(responseData, request.name);
            }
          }
        );

        // Write the request
        await device.writeCharacteristicWithResponseForService(
          serviceUUID,
          characteristicUUID,
          base64Request
        );

        // Wait for response
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`Error handling battery voltage request:`, error);
      }
    } catch (error) {
      console.error("Error fetching device information:", error);
    }
  };

  const createDLMSRequest = (obisCode: string): Buffer => {
    if (obisCode === '3:0-0:96.6.3*255:2') { // Battery Voltage request
      // Only the value payload as seen in the sniffer
      const packet = Buffer.from([
        0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00, 0x0d,
        0xc0, 0x01, packetSequence, 0x00, 0x03, 0x00, 0x00, 0x60,
        0x06, 0x03, 0xff, 0x02, 0x00
      ]);

      //000100010001000dc0014000030000600603ff0200

      console.log(`Created battery voltage request packet (sequence 0x${packetSequence.toString(16)}):`, packet.toString('hex'));
      
      // Increment sequence for next request
      setPacketSequence(prev => {
        const next = prev + 1;
        return next > 0xFF ? 0x41 : next; // Wrap around to 0x41 if we exceed 0xFF
      });

      return packet;
    }
    
    throw new Error('Unsupported OBIS code');
  };

  const calculateCRC = (data: Buffer): Buffer => {
    // CRC-16/X-25 implementation based on sniffed packets
    let crc = 0xFFFF;
    for (let i = 0; i < data.length; i++) {
      crc ^= data[i];
      for (let j = 0; j < 8; j++) {
        if ((crc & 0x0001) !== 0) {
          crc = (crc >> 1) ^ 0x8408;
        } else {
          crc = crc >> 1;
        }
      }
    }
    crc = ~crc;
    return Buffer.from([crc & 0xFF, (crc >> 8) & 0xFF]);
  };

  const parseResponse = (responseData: Buffer, requestName: string) => {
    try {
      console.log(`Parsing ${requestName} response:`, {
        rawData: responseData.toString('hex'),
        length: responseData.length
      });

      // Extract the actual data from the DLMS response
      const dataValue = extractDataFromDLMSResponse(responseData, requestName);
      console.log(`Extracted ${requestName} value:`, dataValue);

      setDeviceData((prevData:any) => ({
        ...prevData,
        [requestName.toLowerCase()]: dataValue
      }));

    } catch (error) {
      console.error(`Error parsing ${requestName} response:`, error);
    }
  };

  const extractDataFromDLMSResponse = (data: Buffer, requestName: string): string => {
    try {
      if (requestName === 'BatteryVoltage') {
        // Log full response for debugging
        const responseHex = data.toString('hex');
        console.log('Raw response:', responseHex);
        
        // Convert buffer to byte array
        const bytes = Array.from(data);
        
        // Find the sequence that indicates the start of the voltage value
        // In the response, we look for 0x03 which precedes the voltage bytes
        const voltageIndex = bytes.findIndex((byte, index) => 
          byte === 0x03 && index + 2 < bytes.length
        );

        if (voltageIndex !== -1) {
          // Get the two bytes after 0x03
          const d8Value = bytes[voltageIndex + 1].toString(16).padStart(2, '0');  // d8
          const nextValue = bytes[voltageIndex + 2].toString(16).padStart(2, '0'); // 01
          
          console.log(`Found bytes: 0x${d8Value} 0x${nextValue}`);
          
          // Combine d8 and first digit of 01 to make d81
          const voltageStr = d8Value + nextValue[0];  // d81
          const voltageValue = parseInt(voltageStr, 16);  // Convert hex d81 to decimal 3457
          
          // Format as voltage with 3 decimal places
          const voltage = (voltageValue / 1000).toFixed(3);
          
          console.log(`Voltage string: ${voltageStr}, Raw value: ${voltageValue}, Final voltage: ${voltage}V`);
          return voltage + " V";
        }
      }
      
      return 'Unable to parse response';
    } catch (error) {
      console.error('Error extracting data:', error);
      return 'Error parsing response';
    }
  };
  
  

  const disconnectDevice = async () => {
    if (connectedDevice) {
      try {
        console.log("Attempting to disconnect from:", connectedDevice.name);
        if (await connectedDevice.isConnected()) {
          await connectedDevice.cancelConnection();
          console.log("Disconnected successfully");
        } else {
          console.log("Device is not connected, skipping disconnection");
        }
        setConnectedDevice(null);
        setDeviceData(null);
      } catch (error: any) {
        console.error("Disconnection error:", error.message);
      }
    } else {
      console.log("No device is currently connected to disconnect");
    }
  };

  const renderDeviceItem = ({ item }: { item: Device }) => (
    <TouchableOpacity
      style={styles.deviceItem}
      onPress={() => connectToDevice(item)}
    >
      <Text style={styles.deviceName}>{item.name || "Unnamed Device"}</Text>
      <Text style={styles.deviceId}>{item.id}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {connectedDevice ? (
        <View style={styles.deviceInfo}>
          <Text style={styles.title}>Connected to: {connectedDevice.name}</Text>
          {deviceData ? (
            <View>
              <Text>Battery Voltage: {deviceData.batteryvoltage || "N/A"}</Text>
              <Text>Valve Status: {deviceData.valvestatus || "N/A"}</Text>
              <Text>Serial Number: {deviceData.serialnumber || "N/A"}</Text>
            </View>
          ) : (
            <Button
              title="Fetch Device Info"
              onPress={() => fetchDeviceInformation(connectedDevice)}
            />
          )}
          <Button title="Disconnect" onPress={disconnectDevice} />
        </View>
      ) : (
        <View>
          <Text style={styles.title}>BLE Interface</Text>
          <Button
            title={isScanning ? "Stop Scan" : "Start Scan"}
            onPress={isScanning ? stopScan : startScan}
          />
          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            renderItem={renderDeviceItem}
            contentContainerStyle={styles.deviceList}
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 10,
  },
  deviceList: {
    marginTop: 20,
  },
  deviceItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  deviceName: {
    fontSize: 16,
  },
  deviceId: {
    fontSize: 12,
    color: "#666",
  },
  deviceInfo: {
    alignItems: "center",
    marginTop: 20,
  },
});

export default BLEInterface;
