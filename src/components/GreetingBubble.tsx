import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { getTimeGreeting } from '../utils/greetings';

interface GreetingBubbleProps {
  onPress: () => void;
  primaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
}

export function GreetingBubble({
  onPress,
  primaryColor = '#FF6B00',
  textColor = '#FFFFFF',
  backgroundColor,
}: GreetingBubbleProps) {
  const [greeting, setGreeting] = useState(() => getTimeGreeting());
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const bg = backgroundColor ?? primaryColor;

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;

    const show = () => {
      setGreeting(getTimeGreeting());
      Animated.spring(scaleAnim, { toValue: 1, friction: 7, tension: 40, useNativeDriver: true }).start();
      timeout = setTimeout(() => {
        Animated.timing(scaleAnim, { toValue: 0, duration: 600, useNativeDriver: true }).start(() => {
          timeout = setTimeout(show, 20000);
        });
      }, 2000);
    };

    timeout = setTimeout(show, 2000);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View style={[styles.bubbleWrap, { transform: [{ scale: scaleAnim }] }]} pointerEvents="box-none">
      <Pressable style={[styles.bubble, { backgroundColor: bg }]} onPress={onPress}>
        <Ionicons name="chatbubble-ellipses" size={14} color={textColor} />
        <Text style={[styles.bubbleText, { color: textColor }]} numberOfLines={1}>
          {greeting}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bubbleWrap: {
    alignItems: 'center',
    position: 'absolute',
    right: 44,
    top: 3,
    zIndex: 999,
  },
  bubble: {
    alignItems: 'center',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  bubbleText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
