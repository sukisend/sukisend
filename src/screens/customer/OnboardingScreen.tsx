import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface OnboardingScreenProps {
  onContinue: () => void;
}

export function OnboardingScreen({ onContinue }: OnboardingScreenProps) {
  return (
    <LinearGradient colors={['#F97316', '#FB923C', '#166534']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.card}>
          <Image source={require('../../../assets/suki-send-logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>SUKI SEND</Text>
          <Text style={styles.tagline}>From Store to Door, Ka Suki</Text>
          <Text style={styles.description}>
            Daily essentials for your home, delivered with care and convenience.
          </Text>

          <View style={styles.bullets}>
            <Text style={styles.bullet}>- Discover everyday needs in one app</Text>
            <Text style={styles.bullet}>- Fast ordering and smooth checkout</Text>
            <Text style={styles.bullet}>- Reliable COD delivery to your doorstep</Text>
          </View>

          <Pressable style={styles.primaryButton} onPress={onContinue}>
            <Text style={styles.primaryButtonText}>Start Shopping</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    backgroundColor: '#FFFFFFEE',
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 28,
    width: '100%',
  },
  logo: {
    alignSelf: 'center',
    height: 82,
    marginBottom: 10,
    width: 82,
  },
  title: {
    color: '#111827',
    fontSize: 30,
    fontWeight: '600',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  tagline: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  description: {
    color: '#374151',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 14,
    textAlign: 'center',
  },
  bullets: {
    gap: 8,
    marginTop: 20,
  },
  bullet: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: '#F97316',
    borderRadius: 999,
    marginTop: 24,
    paddingVertical: 14,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
