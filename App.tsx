
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BLEInterface from './ble';

export default function App() {
  return (
    <View style={styles.container}>
<BLEInterface/>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
