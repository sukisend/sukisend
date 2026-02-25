import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../providers/ThemeProvider';
import { useCartStore } from '../store/cartStore';
import { AccountScreen } from '../screens/customer/AccountScreen';
import { AuthScreen } from '../screens/customer/AuthScreen';
import { CartScreen } from '../screens/customer/CartScreen';
import { CheckoutScreen } from '../screens/customer/CheckoutScreen';
import { ExploreScreen } from '../screens/customer/ExploreScreen';
import { HomeScreen } from '../screens/customer/HomeScreen';
import { OrdersScreen } from '../screens/customer/OrdersScreen';
import { ProductDetailScreen } from '../screens/customer/ProductDetailScreen';
import { CustomerStackParamList, CustomerTabsParamList } from './types';

const Stack = createNativeStackNavigator<CustomerStackParamList>();
const Tab = createBottomTabNavigator<CustomerTabsParamList>();

function CustomerTabs() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const cartCount = useCartStore((state) => state.items.reduce((sum, item) => sum + item.quantity, 0));
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
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
          const iconMap: Record<keyof CustomerTabsParamList, string> = {
            Home: 'home-outline',
            Explore: 'grid-outline',
            Cart: 'bag-outline',
            Orders: 'receipt-outline',
            Account: 'person-outline',
          };

          return <Ionicons name={iconMap[route.name as keyof CustomerTabsParamList] as any} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Explore" component={ExploreScreen} />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarBadge: cartCount > 0 ? cartCount : undefined,
        }}
      />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
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
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Stack.Screen name="CustomerTabs" component={CustomerTabs} options={{ headerShown: false }} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} options={{ title: 'Product Details' }} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} options={{ title: 'Checkout' }} />
      <Stack.Screen name="Auth" component={AuthScreen} options={{ title: 'Sign In / Sign Up', presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
