import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '../providers/AuthProvider';
import { useTheme } from '../providers/ThemeProvider';
import { fetchCustomerUnreadSellerMessagesCount } from '../services/chatModerationService';
import { useCartStore } from '../store/cartStore';
import { AccountScreen } from '../screens/customer/AccountScreen';
import { AuthScreen } from '../screens/customer/AuthScreen';
import { CartScreen } from '../screens/customer/CartScreen';
import { CheckoutScreen } from '../screens/customer/CheckoutScreen';
import { ChatSellerScreen } from '../screens/customer/ChatSellerScreen';
import { HomeScreen } from '../screens/customer/HomeScreen';
import { LegalScreen } from '../screens/customer/LegalScreen';
import { OrdersScreen } from '../screens/customer/OrdersScreen';
import { ProductDetailScreen } from '../screens/customer/ProductDetailScreen';
import { CustomerStackParamList, CustomerTabsParamList } from './types';

const Stack = createNativeStackNavigator<CustomerStackParamList>();
const Tab = createBottomTabNavigator<CustomerTabsParamList>();

function CustomerTabs() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { role, profile } = useAuth();
  const cartCount = useCartStore((state) => state.items.length);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const bottomInset = Math.max(insets.bottom, 8);

  useEffect(() => {
    if (role !== 'customer' || !profile?.id) {
      setChatUnreadCount(0);
      return;
    }

    let active = true;
    const syncChatUnread = async () => {
      try {
        const next = await fetchCustomerUnreadSellerMessagesCount(profile.id);
        if (active) {
          setChatUnreadCount(next);
        }
      } catch {
        if (active) {
          setChatUnreadCount(0);
        }
      }
    };

    syncChatUnread();
    const timer = setInterval(syncChatUnread, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [profile?.id, role]);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
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
          const iconMap: Record<keyof CustomerTabsParamList, string> = {
            Shop: 'storefront-outline',
            Cart: 'cart',
            Orders: 'receipt-outline',
            Account: 'person-outline',
          };

          return <Ionicons name={iconMap[route.name as keyof CustomerTabsParamList] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Shop" component={HomeScreen} />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
        }}
      />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{
          tabBarBadge: chatUnreadCount > 0 ? chatUnreadCount : undefined,
        }}
      />
    </Tab.Navigator>
  );
}

export function CustomerNavigator() {
  const { theme } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        animation: 'fade',
      }}
    >
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product Details' }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
      <Stack.Screen name="ChatSeller" component={ChatSellerScreen} options={{ title: 'Chat Seller', animation: 'fade' }} />
      <Stack.Screen name="Legal" component={LegalScreen} options={{ title: 'Policies', animation: 'fade' }} />
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{ title: 'Sign In / Sign Up', presentation: 'modal', animation: 'fade' }}
      />
    </Stack.Navigator>
  );
}
