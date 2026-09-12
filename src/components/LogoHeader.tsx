import { Image, StyleSheet, View } from 'react-native';

export function LogoHeader() {

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/suki-send-logo.png')} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  logo: {
    height: 48,
    width: 160,
  },
});
