import React from "react";
import { StyleSheet, Text, View } from "react-native";
import BLEInterface from "./ble";

export default function App() {
  console.log("process.env.EXPO_BUILD >>", process.env.EXPO_PUBLIC_BUILD);
  return (
    <View style={styles.container}>
      {process.env.EXPO_PUBLIC_BUILD == "development" && <BLEInterface />}
      <Text>Hello</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});
