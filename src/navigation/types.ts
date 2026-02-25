import { NavigatorScreenParams } from '@react-navigation/native';

import { Product } from '../types/models';

export type CustomerTabsParamList = {
  Home: undefined;
  Explore: undefined;
  Cart: undefined;
  Orders: undefined;
  Account: undefined;
};

export type CustomerStackParamList = {
  CustomerTabs: NavigatorScreenParams<CustomerTabsParamList> | undefined;
  ProductDetail: { product: Product };
  Checkout: undefined;
  Auth: {
    mode?: 'signin' | 'signup' | 'admin';
    intent?: 'checkout' | 'account';
  };
};

export type AdminTabsParamList = {
  Dashboard: undefined;
  Products: undefined;
  Transactions: undefined;
  Reports: undefined;
  AdminAccount: undefined;
};
