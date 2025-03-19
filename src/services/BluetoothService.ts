import BleManager, { Peripheral } from 'react-native-ble-manager';
import { PermissionsAndroid, Platform } from 'react-native';

// DLMS/COSEM Service and Characteristic UUIDs
const DLMS_SERVICE_UUID = '005a02fe-bea5-46a0-c000-73c0d9b578fc';
const DLMS_CHARACTERISTIC_UUID = '005a02fe-bea5-46a0-c101-73c0d9b578fc';

// OBIS codes for the required parameters
const OBIS_CODES = {
  BATTERY_VOLTAGE: '3-0-0:96.6.3*255:2',
  VALVE_STATUS: '8-0:96.61.7*255:2',
  ACCUMULATED_VOLUME: '8-0:1.0.0*255:2',
};

class BluetoothService {
  constructor() {
    BleManager.start({ showAlert: false });
  }

  async requestPermissions() {
    if (Platform.OS === 'android' && Platform.Version >= 23) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }

  async startScan() {
    try {
      await this.requestPermissions();
      await BleManager.scan([], 5, true);
      console.log('Scanning started');
    } catch (error) {
      console.error('Scan error:', error);
    }
  }

  async connectToDevice(deviceId: string) {
    try {
      await BleManager.connect(deviceId);
      console.log('Connected to device:', deviceId);
      
      // Discover services and characteristics
      await BleManager.retrieveServices(deviceId);
      
      // Set MTU size as required by the protocol
      if (Platform.OS === 'android') {
        await BleManager.requestMTU(deviceId, 250);
      }
      
      return true;
    } catch (error) {
      console.error('Connection error:', error);
      return false;
    }
  }

  async readBatteryVoltage(deviceId: string): Promise<number | null> {
    try {
      const response = await BleManager.read(
        deviceId,
        DLMS_SERVICE_UUID,
        DLMS_CHARACTERISTIC_UUID
      );
      // Parse the DLMS response for battery voltage
      return this.parseDLMSResponse(response, OBIS_CODES.BATTERY_VOLTAGE);
    } catch (error) {
      console.error('Error reading battery voltage:', error);
      return null;
    }
  }

  async readValveStatus(deviceId: string): Promise<number | null> {
    try {
      const response = await BleManager.read(
        deviceId,
        DLMS_SERVICE_UUID,
        DLMS_CHARACTERISTIC_UUID
      );
      // Parse the DLMS response for valve status
      return this.parseDLMSResponse(response, OBIS_CODES.VALVE_STATUS);
    } catch (error) {
      console.error('Error reading valve status:', error);
      return null;
    }
  }

  async readAccumulatedVolume(deviceId: string): Promise<number | null> {
    try {
      const response = await BleManager.read(
        deviceId,
        DLMS_SERVICE_UUID,
        DLMS_CHARACTERISTIC_UUID
      );
      // Parse the DLMS response for accumulated volume
      return this.parseDLMSResponse(response, OBIS_CODES.ACCUMULATED_VOLUME);
    } catch (error) {
      console.error('Error reading accumulated volume:', error);
      return null;
    }
  }

  private parseDLMSResponse(response: any, obisCode: string): number | null {
    // Implementation of DLMS response parsing would go here
    // This would need to be implemented according to the DLMS/COSEM protocol
    return null;
  }

  async disconnect(deviceId: string) {
    try {
      await BleManager.disconnect(deviceId);
      console.log('Disconnected from device:', deviceId);
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  }
}

export default new BluetoothService(); 