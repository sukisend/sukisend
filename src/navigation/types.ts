import { NavigatorScreenParams } from '@react-navigation/native';

import { Product } from '../types/models';

export type CustomerTabsParamList = {
  Shop: undefined;
  Cart: undefined;
  Orders: undefined;
  Account: undefined;
};

export type CustomerStackParamList = {
  CustomerTabs: NavigatorScreenParams<CustomerTabsParamList> | undefined;
  ProductDetail: { product: Product };
  Checkout:
    | {
        selectedKeys?: string[];
      }
    | undefined;
  ChatSeller: undefined;
  Legal: undefined;
  Auth: {
    mode?: 'signin' | 'signup' | 'admin';
    intent?: 'checkout' | 'account';
  };
};

export type AdminTabsParamList = {
  Dashboard: undefined;
  Products: undefined;
  Transactions: undefined;
  Inbox: undefined;
  Reports: undefined;
  AdminAccount: undefined;
};

export type RiderTabsParamList = {
  Deliveries: undefined;
  RiderAccount: undefined;
};
