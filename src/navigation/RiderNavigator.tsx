import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../providers/ThemeProvider';
import { RiderAccountScreen } from '../screens/rider/RiderAccountScreen';
import { RiderDeliveriesScreen } from '../screens/rider/RiderDeliveriesScreen';
import { RiderTabsParamList } from './types';

const Tab = createBottomTabNavigator<RiderTabsParamList>();

export function RiderNavigator() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: 'transparent',
          height: 58 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 6,
        },
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '500',
          letterSpacing: -0.2,
        },
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<keyof RiderTabsParamList, string> = {
            Deliveries: 'bicycle-outline',
            RiderAccount: 'person-circle-outline',
          };

          return <Ionicons name={iconMap[route.name as keyof RiderTabsParamList] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Deliveries" component={RiderDeliveriesScreen} />
      <Tab.Screen name="RiderAccount" component={RiderAccountScreen} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}
