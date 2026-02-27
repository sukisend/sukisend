import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemeModeToggle } from '../components/ThemeModeToggle';
import { useTheme } from '../providers/ThemeProvider';
import { AdminAccountScreen } from '../screens/admin/AdminAccountScreen';
import { AdminDashboardScreen } from '../screens/admin/AdminDashboardScreen';
import { AdminInboxScreen } from '../screens/admin/AdminInboxScreen';
import { AdminProductsScreen } from '../screens/admin/AdminProductsScreen';
import { AdminReportsScreen } from '../screens/admin/AdminReportsScreen';
import { AdminTransactionsScreen } from '../screens/admin/AdminTransactionsScreen';
import { fetchAdminOrderAlertCount } from '../services/adminService';
import { fetchAdminUnreadSellerMessagesCount } from '../services/chatModerationService';
import { AdminTabsParamList } from './types';

const Tab = createBottomTabNavigator<AdminTabsParamList>();
const ORDER_BADGE_SEEN_KEY = 'suki-send-admin-order-badge-seen-at';

export function AdminNavigator() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const [orderAlertCount, setOrderAlertCount] = useState(0);
  const [inboxUnreadCount, setInboxUnreadCount] = useState(0);
  const [orderSeenAt, setOrderSeenAt] = useState<string | null>(null);
  const bottomInset = Math.max(insets.bottom, 8);

  useEffect(() => {
    AsyncStorage.getItem(ORDER_BADGE_SEEN_KEY)
      .then((value) => {
        setOrderSeenAt(value);
      })
      .catch(() => {
        setOrderSeenAt(null);
      });
  }, []);

  const markOrdersAsSeen = () => {
    const seenAt = new Date().toISOString();
    setOrderSeenAt(seenAt);
    setOrderAlertCount(0);
    AsyncStorage.setItem(ORDER_BADGE_SEEN_KEY, seenAt).catch(() => {
      // Ignore local storage failures for badge timestamps.
    });
  };

  useEffect(() => {
    let active = true;

    const refreshBadges = async () => {
      try {
        const [nextOrderAlerts, nextInboxUnread] = await Promise.all([
          fetchAdminOrderAlertCount(orderSeenAt ?? undefined),
          fetchAdminUnreadSellerMessagesCount(),
        ]);

        if (!active) {
          return;
        }

        setOrderAlertCount(nextOrderAlerts);
        setInboxUnreadCount(nextInboxUnread);
      } catch {
        if (!active) {
          return;
        }

        setOrderAlertCount(0);
        setInboxUnreadCount(0);
      }
    };

    refreshBadges();
    const timer = setInterval(refreshBadges, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [orderSeenAt]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '800' },
        headerRight: () => <ThemeModeToggle compact showLabel={false} />,
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
            Inbox: 'mail-unread-outline',
            Reports: 'analytics-outline',
            AdminAccount: 'person-circle-outline',
          };

          return <Ionicons name={iconMap[route.name as keyof AdminTabsParamList] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Dashboard" component={AdminDashboardScreen} />
      <Tab.Screen name="Products" component={AdminProductsScreen} />
      <Tab.Screen
        name="Transactions"
        component={AdminTransactionsScreen}
        options={{
          tabBarBadge: orderAlertCount > 0 ? orderAlertCount : undefined,
        }}
        listeners={{
          focus: markOrdersAsSeen,
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={AdminInboxScreen}
        options={{
          tabBarBadge: inboxUnreadCount > 0 ? inboxUnreadCount : undefined,
        }}
      />
      <Tab.Screen name="Reports" component={AdminReportsScreen} />
      <Tab.Screen name="AdminAccount" component={AdminAccountScreen} options={{ title: 'Account' }} />
    </Tab.Navigator>
  );
}
