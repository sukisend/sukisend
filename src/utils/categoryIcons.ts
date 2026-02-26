const CATEGORY_ICON_MAP: Record<string, string> = {
  Household: '🏠',
  Gadgets: '📱',
  'Personal Care': '🧴',
  Grocery: '🛒',
  Liquor: '🍺',
  Chilled: '🧊',
  Vegetables: '🥬',
  Fruits: '🍎',
  Meat: '🥩',
  Fish: '🐟',
  Beverages: '🥤',
};

export function getCategoryIcon(name: string, customIcon?: string): string {
  const normalized = customIcon?.trim();
  if (normalized) {
    return normalized;
  }

  return CATEGORY_ICON_MAP[name] ?? '📦';
}
