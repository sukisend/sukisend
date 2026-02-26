import { Image, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../providers/ThemeProvider';

export function LogoHeader() {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Image source={require('../../assets/suki-send-logo.png')} style={styles.logo} resizeMode="contain" />
      <View>
        <Text style={[styles.title, { color: theme.colors.text }]}>SUKI SEND</Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]}>From Store to Door, Ka Suki</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  logo: {
    height: 40,
    width: 40,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
});
