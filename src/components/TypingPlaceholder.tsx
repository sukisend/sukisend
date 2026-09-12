import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { TYPING_PLACEHOLDER_MESSAGES } from '../utils/greetings';

interface TypingPlaceholderProps {
  visible: boolean;
  color?: string;
}

export function TypingPlaceholder({ visible, color = '#999' }: TypingPlaceholderProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const [displayText, setDisplayText] = useState('');
  const [phase, setPhase] = useState<'typing' | 'dots' | 'pausing'>('dots');
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!visible) {
      fadeAnim.setValue(0);
      return;
    }
    Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [visible]);

  // Bouncing dots animation
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(dot1, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(dot1, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(dot1, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(dot2, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.timing(dot3, { toValue: 1, duration: 300, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  // Phase cycle: dots -> typing text -> pausing -> next message
  useEffect(() => {
    if (!visible) return;

    let timer: ReturnType<typeof setTimeout>;

    if (phase === 'dots') {
      setDisplayText('');
      timer = setTimeout(() => setPhase('typing'), 900);
    } else if (phase === 'typing') {
      const msg = TYPING_PLACEHOLDER_MESSAGES[messageIndex];
      let charIndex = 0;
      const typeInterval = setInterval(() => {
        charIndex++;
        setDisplayText(msg.slice(0, charIndex));
        if (charIndex >= msg.length) {
          clearInterval(typeInterval);
          setPhase('pausing');
        }
      }, 45);
      return () => clearInterval(typeInterval);
    } else if (phase === 'pausing') {
      timer = setTimeout(() => {
        setMessageIndex((prev) => (prev + 1) % TYPING_PLACEHOLDER_MESSAGES.length);
        setPhase('dots');
      }, 2000);
    }

    return () => clearTimeout(timer);
  }, [visible, phase, messageIndex]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity: fadeAnim }]} pointerEvents="none">
      {phase === 'dots' && !displayText ? (
        <View style={styles.dotsRow}>
          <Animated.View style={[styles.dot, { opacity: dot1, backgroundColor: color }]} />
          <Animated.View style={[styles.dot, { opacity: dot2, backgroundColor: color }]} />
          <Animated.View style={[styles.dot, { opacity: dot3, backgroundColor: color }]} />
        </View>
      ) : (
        <Text style={[styles.text, { color }]} numberOfLines={1}>
          {displayText}
          <Text style={{ opacity: 0.4 }}>|</Text>
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    position: 'absolute',
    right: 40,
    top: 0,
  },
  dotsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: '500',
  },
});
