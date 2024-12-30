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
    setDevices([]);

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error("Scan error:", error.message);
        stopScan();
        return;
      }

      if (device && device.name) {
        console.log("Discovered device:", device.name, device.id);
        setDevices((prevDevices) => {
          if (!prevDevices.find((d) => d.id === device.id)) {
            return [...prevDevices, device];
          }
          return prevDevices;
        });
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
      if (connectedDevice) {
        console.log(`Disconnecting from previously connected device: ${connectedDevice.name}`);
        await disconnectDevice();
      }

      console.log("Checking if device is already connected...");
      const isConnected = await bleManager.isDeviceConnected(device.id);

      if (isConnected) {
        console.log("Device is already connected. Skipping reconnection.");
        setConnectedDevice(device);
        return;
      }

      console.log("Connecting to device:", device.name);
      const newConnectedDevice = await device.connect();
      console.log("Connected to:", newConnectedDevice.name);
      setConnectedDevice(newConnectedDevice);

      await newConnectedDevice.requestMTU(250);
      console.log("MTU size set to 250");

      await newConnectedDevice.discoverAllServicesAndCharacteristics();
      console.log("Services and characteristics discovered");

      // Read Battery Level
      const batteryCharacteristic = await newConnectedDevice.readCharacteristicForService(
        "180F", // Battery Service UUID
        "2A19"  // Battery Level Characteristic UUID
      );
      const batteryLevel = parseInt(batteryCharacteristic.value || "0", 16);
      console.log("Battery Level:", batteryLevel);

      // Read Valve Status
      const valveCharacteristic = await newConnectedDevice.readCharacteristicForService(
        "005a02fe-bea5-46a0-c000-73c0d9b578fc", // DLMS/COSEM Interface UUID
        "005a02fe-bea5-46a0-c101-73c0d9b578fc"  // Notify/Write Characteristic
      );
      console.log("Valve Status (Raw):", valveCharacteristic.value);

      // Update device data
      setDeviceData({
        batteryLevel,
        valveStatus: valveCharacteristic.value || "Unknown",
      });
    } catch (error: any) {
      console.error("Connection error:", error.message);
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
          <Text>Battery Level: {deviceData?.batteryLevel || "Fetching..."}</Text>
          <Text>Valve Status: {deviceData?.valveStatus || "Fetching..."}</Text>
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
