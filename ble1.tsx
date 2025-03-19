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

const BLEInterface1 = () => {
  const [bleManager] = useState(new BleManager());
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [deviceData, setDeviceData] = useState<any>(null);

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
      await connectedDevice.requestMTU(250);
      console.log("MTU size set to 250");

      // Discover all services and characteristics
      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log("Services and characteristics discovered");

      // Set connected device
      setConnectedDevice(connectedDevice);
    } catch (error: any) {
      console.error(`Error connecting to device: ${device.id}`, error.message);
      if (connectedDevice) {
        console.warn("Cleaning up partial connection...");
        await disconnectDevice(); // Ensure clean disconnection in case of failure
      }
    }
  };

  
  const fetchDeviceInformation = async (device: Device) => {
    try {
      const services = {
        GAP: "1800",
        DEVICE_INFO: "180A",
        GATT: "1801",
        DLMS_COSEM: "005a02fe-bea5-46a0-c000-73c0d9b578fc", // Metering Interface
      };
  
      const characteristics = {
        deviceName: "2A00",
        appearance: "2A01",
        info: "2A05",
        hardwareRevisionString: "2A27",
        manufacturerNameString: "2A29",
        serialNumber: "2A25",
        firmwareVersion: "2A26",
        notifyWrite: "005a02fe-bea5-46a0-c101-73c0d9b578fc", // Notify/Write for DLMS
      };
  
      console.log("Connecting and discovering services...");
      await device.connect();
      await device.discoverAllServicesAndCharacteristics();
      console.log("Services and characteristics discovered.");
  
      // L2CAP payload (58 bytes)
      const l2capPayload = Buffer.from(
        "36000400121800000100100001002b6029a109060760857405080101a60a04080000000000000000be10040e01000000065f1f0400207e1f01f4",
        "hex"
      );
  
      // Convert L2CAP payload to a frame with 30 bytes
      const frame = convertL2CAPToFrame(l2capPayload);
      console.log("Converted Frame:", frame.toString("hex"));
  
      if (frame.length !== 30) {
        console.error("Error: Frame is not 30 bytes, check conversion logic.");
        return;
      }
  
      // Send the converted frame (30 bytes)
      const response1 = await device.writeCharacteristicWithResponseForService(
        services.DLMS_COSEM,
        characteristics.notifyWrite,
        frame.toString("base64")
      );
  
      console.log("Response from first command:", response1);
    } catch (error:any) {
      console.error("An error occurred:", error.message);
    }
  };
  
  /**
 * Converts an L2CAP payload dynamically into a frame.
 * @param {Buffer} l2capPayload - Raw L2CAP payload
 * @returns {Buffer} 30-byte converted frame
 */
function convertL2CAPToFrame(l2capPayload:any) {
  if (!l2capPayload || l2capPayload.length < 30) {
    throw new Error("Invalid L2CAP payload, needs at least 30 bytes.");
  }

  // Ensure we extract only 30 bytes
  return Buffer.concat([
    Buffer.from([0x07, 0x17]), // Custom BLE prefix
    l2capPayload.slice(8, 36), // Dynamically extract only 28 bytes from payload
  ]);
}

  
  
  
  const parseBatteryVoltage = (decodedValue:any) => {
    try {
      const offset = 3; // Adjust offset based on DLMS response
      const batteryVoltageRaw = decodedValue.readUInt16BE(offset); // 16-bit integer
      console.log("batteryVoltageRaw", batteryVoltageRaw);
      return batteryVoltageRaw / 1000; // Convert millivolts to volts
    } catch (error:any) {
      console.error("Failed to parse battery voltage:", error.message);
      return null;
    }
  };
  
  const parseMeterReading = (decodedValue:any) => {
    try {
      const offset = 3;
      const meterReadingRaw = decodedValue.readUInt32BE(offset); 
      console.log("MeterReadingRaw: " + meterReadingRaw);
      return meterReadingRaw; 
    } catch (error:any) {
      console.error("Failed to parse meter reading:", error.message);
      return null;
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
              <Text>Serial Number: {deviceData.serialNumber || "N/A"}</Text>
              <Text>Firmware Version: {deviceData.firmwareVersion || "N/A"}</Text>
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

export default BLEInterface1;
