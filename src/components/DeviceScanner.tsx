import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, StyleSheet } from 'react-native';
import BluetoothService from '../services/BluetoothService';

interface Device {
  id: string;
  name: string;
}

interface DeviceData {
  batteryVoltage: number | null;
  valveStatus: number | null;
  accumulatedVolume: number | null;
}

export const DeviceScanner: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<string | null>(null);
  const [deviceData, setDeviceData] = useState<DeviceData | null>(null);

  useEffect(() => {
    // Subscribe to device discovery events
    // Implementation depends on your BLE manager events
  }, []);

  const startScan = async () => {
    setScanning(true);
    await BluetoothService.startScan();
    setTimeout(() => setScanning(false), 5000);
  };

  const connectToDevice = async (deviceId: string) => {
    const connected = await BluetoothService.connectToDevice(deviceId);
    if (connected) {
      setConnectedDevice(deviceId);
      await fetchDeviceData(deviceId);
    }
  };

  const fetchDeviceData = async (deviceId: string) => {
    const batteryVoltage = await BluetoothService.readBatteryVoltage(deviceId);
    const valveStatus = await BluetoothService.readValveStatus(deviceId);
    const accumulatedVolume = await BluetoothService.readAccumulatedVolume(deviceId);

    setDeviceData({
      batteryVoltage,
      valveStatus,
      accumulatedVolume,
    });
  };

  return (
    <View style={styles.container}>
      <Button
        title={scanning ? 'Scanning...' : 'Scan for Devices'}
        onPress={startScan}
        disabled={scanning}
      />

      <FlatList
        data={devices}
        renderItem={({ item }) => (
          <View style={styles.deviceItem}>
            <Text>{item.name || 'Unknown Device'}</Text>
            <Button
              title="Connect"
              onPress={() => connectToDevice(item.id)}
              disabled={connectedDevice !== null}
            />
          </View>
        )}
        keyExtractor={item => item.id}
      />

      {deviceData && (
        <View style={styles.dataContainer}>
          <Text>Battery Voltage: {deviceData.batteryVoltage}V</Text>
          <Text>Valve Status: {deviceData.valveStatus === 0 ? 'Closed' : 'Open'}</Text>
          <Text>Accumulated Volume: {deviceData.accumulatedVolume} m³</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
  },
  dataContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
}); 