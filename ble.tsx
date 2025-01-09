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
        // CURRENT_TIME: "1805",
        DLMS_COSEM: "005a02fe-bea5-46a0-c000-73c0d9b578fc", // Metering Interface
      };
  
      const characteristics = {
        deviceName: "2A00",
        appearance: "2A01",
        serialNumber: "2A25",
        firmwareVersion: "2A26",
        // currentTime: "2A2B",
        notifyWrite: "005a02fe-bea5-46a0-c101-73c0d9b578fc", // Notify/Write for DLMS
      };

  
      console.log("Checking connection state...");
      const isConnected = await device.isConnected();
      if (!isConnected) {
        console.log("Attempting to reconnect...");
        await device.connect();
        await device.discoverAllServicesAndCharacteristics();
        console.log("Reconnection successful");
      }
  
      console.log("Reading device characteristics...");
  
      // Read GAP characteristics
      const deviceNameChar = await device.readCharacteristicForService(
        services.GAP,
        characteristics.deviceName
      );
      const appearanceChar = await device.readCharacteristicForService(
        services.GAP,
        characteristics.appearance
      );
  
      // Read Device Information characteristics
      const serialNumberChar = await device.readCharacteristicForService(
        services.DEVICE_INFO,
        characteristics.serialNumber
      );
      const firmwareVersionChar = await device.readCharacteristicForService(
        services.DEVICE_INFO,
        characteristics.firmwareVersion
      );

      // const CurrentTime = await device.readCharacteristicForService(
      //   services.CURRENT_TIME,
      //   characteristics.currentTime
      // )
  
      // Parse the standard information
      const deviceName = Buffer.from(deviceNameChar.value || "", "base64").toString("utf-8");
      const appearance = Buffer.from(appearanceChar.value || "", "base64").readUInt16LE(0);
      const serialNumber = Buffer.from(serialNumberChar.value || "", "base64").toString("utf-8");
      const firmwareVersion = Buffer.from(firmwareVersionChar.value || "", "base64").toString("utf-8");
      // const CurrentTimeofDevice = Buffer.from(CurrentTime.value || "", "base64").toString("utf-8");
  
      console.log("Successfully read characteristics");
      console.log("Device Name:", deviceName);
      console.log("Appearance:", appearance);
      console.log("Serial Number:", serialNumber);
      console.log("Firmware Version:", firmwareVersion);
      // console.log("Current Time:", CurrentTimeofDevice);
  
      // Retrieve Battery Voltage using DLMS COSEM
      console.log("Requesting battery voltage...");
      const obisCode = "000b600603ff"; // OBIS code for Battery Voltage (0.b.96.6.3)
      const dlmsRequest = `C001${obisCode}`; // DLMS Get Request with OBIS Code
      const data = await device.writeCharacteristicWithoutResponseForService(
        services.DLMS_COSEM,
        characteristics.notifyWrite,
        Buffer.from(dlmsRequest, "hex").toString("base64")
      );
  
      console.log("Battery Voltage request sent",data);
  
      const subscription = bleManager.monitorCharacteristicForDevice(
        device.id,
        services.DLMS_COSEM,
        characteristics.notifyWrite,
        (error:any, characteristic:any) => {
          if (error) {
            console.error("Error receiving battery voltage:", error.message);
            return;
          }
  
          const decodedValue = Buffer.from(characteristic.value, "base64");
          console.log("Decoded value for battery voltage:", decodedValue);
  
          const batteryVoltage = parseBatteryVoltage(decodedValue);
          console.log("Battery Voltage:", batteryVoltage);
  
          setDeviceData((prevData:any) => ({
            ...prevData,
            batteryVoltage,
          }));
        }
      );
  
      console.log("Battery Voltage subscription active");
  
      setDeviceData({
        deviceName,
        appearance,
        serialNumber,
        firmwareVersion,
      });
  
      // Clean up the subscription
      return () => subscription.remove();
    } catch (error:any) {
      console.error("Failed to fetch device information:", error.message);
    }
  };
  
  // Parse Battery Voltage from DLMS Response
  const parseBatteryVoltage = (decodedValue:any) => {
    try {
      // Assuming battery voltage is stored as an unsigned integer starting at a specific offset
      const batteryVoltageRaw = decodedValue.readUInt32BE(0); // Adjust the offset based on DLMS response
      const batteryVoltage = batteryVoltageRaw / 1000; // Convert millivolts to volts
      return batteryVoltage;
    } catch (error:any) {
      console.error("Failed to parse battery voltage:", error.message);
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

export default BLEInterface;
