import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../providers/ThemeProvider';
import { AdminAccountScreen } from '../screens/admin/AdminAccountScreen';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { AdminProductsScreen } from '../screens/admin/AdminProductsScreen';
import { AdminReportsScreen } from '../screens/admin/AdminReportsScreen';
import { AdminTransactionsScreen } from '../screens/admin/AdminTransactionsScreen';
import { AdminTabsParamList } from './types';

const Tab = createBottomTabNavigator<AdminTabsParamList>();

export function AdminNavigator() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '800' },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: 62 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        tabBarIcon: ({ color, size }) => {
          const iconMap: Record<keyof AdminTabsParamList, string> = {
            Dashboard: 'speedometer-outline',
            Products: 'cube-outline',
            Transactions: 'receipt-outline',
            Reports: 'analytics-outline',
            AdminAccount: 'person-circle-outline',
          };

          return <Ionicons name={iconMap[route.name as keyof AdminTabsParamList] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen name="Products" component={AdminProductsScreen} />
      <Tab.Screen name="Transactions" component={AdminTransactionsScreen} />
      <Tab.Screen name="Reports" component={AdminReportsScreen} />
      <Tab.Screen name="AdminAccount" component={AdminAccountScreen} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}
