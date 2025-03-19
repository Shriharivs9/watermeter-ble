declare module 'react-native-ble-manager' {
  export interface Peripheral {
    id: string;
    name?: string;
    rssi?: number;
    advertising?: object;
  }

  const BleManager: {
    start: (options?: { showAlert?: boolean }) => Promise<void>;
    scan: (serviceUUIDs: string[], seconds: number, allowDuplicates?: boolean) => Promise<void>;
    connect: (peripheralId: string) => Promise<void>;
    disconnect: (peripheralId: string) => Promise<void>;
    retrieveServices: (peripheralId: string) => Promise<void>;
    read: (peripheralId: string, serviceUUID: string, characteristicUUID: string) => Promise<any>;
    write: (peripheralId: string, serviceUUID: string, characteristicUUID: string, data: any) => Promise<void>;
    requestMTU: (peripheralId: string, mtu: number) => Promise<void>;
  };

  export default BleManager;
} 