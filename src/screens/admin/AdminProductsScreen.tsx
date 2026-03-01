import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { BrandedLoader } from '../../components/BrandedLoader';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useMinimumLoader } from '../../hooks/useMinimumLoader';
import { useTheme } from '../../providers/ThemeProvider';
import { pickAndUploadImages } from '../../services/mediaService';
import {
  deleteCategory,
  deleteProduct,
  fetchAdminCategories,
  fetchInventoryProducts,
  saveCategory,
  saveProduct,
  updateCategory,
} from '../../services/adminService';
import { Category, Product } from '../../types/models';
import { formatPHP } from '../../utils/currency';
import { getCategoryIcon } from '../../utils/categoryIcons';
import { clampPercent, computeSalePrice, getDiscountPercentFromPrice } from '../../utils/pricing';

interface ProductFormState {
  id?: string;
  name: string;
  categoryName: string;
  unit: string;
  cost: string;
  price: string;
  stock: string;
  minStock: string;
  sku: string;
  discountPercent: string;
  description: string;
}

interface ProductVariantFormState {
  id?: string;
  name: string;
  value: string;
  priceDelta: string;
  stockOverride: string;
  isActive: boolean;
}

interface VariantDraftState {
  name: string;
  value: string;
  priceDelta: string;
  stockOverride: string;
}

const EMPTY_FORM: ProductFormState = {
  name: '',
  categoryName: '',
  unit: 'pcs',
  cost: '',
  price: '',
  stock: '',
  minStock: '',
  sku: '',
  discountPercent: '',
  description: '',
};
const EMPTY_VARIANT_DRAFT: VariantDraftState = { name: '', value: '', priceDelta: '', stockOverride: '' };
const COMMON_UNITS = ['pcs', 'kg', 'g', 'oz', 'ml', 'L', 'cm', 'inch', 'box', 'pack'];
const VARIANT_NAME_PRESETS = ['Color', 'Size', 'Weight', 'Volume', 'Length', 'Material', 'Pack'];
const PAGE_SIZE = 8;
const PRODUCT_IMAGE_LIMIT = 20;
const DISCOUNT_PRESETS = [0, 5, 10, 15, 20, 30, 40, 50];
const VARIANT_VALUE_PRESETS: Record<string, string[]> = {
  color: ['Orange', 'Blue', 'Red', 'Green', 'Black', 'White'],
  size: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  weight: ['100g', '250g', '500g', '1kg', '2kg'],
  volume: ['100ml', '250ml', '500ml', '1L', '2L'],
  length: ['5cm', '10cm', '20cm', '30cm', '1in', '2in', '3in'],
  pack: ['1 pc', '3 pcs', '6 pcs', '12 pcs'],
};
const STOCK_SORT_OPTIONS = [
  { id: 'newest', label: 'Newest' },
  { id: 'name_asc', label: 'A-Z' },
  { id: 'stock_low', label: 'Low-High Stock' },
  { id: 'stock_high', label: 'High-Low Stock' },
] as const;
type StockSortOption = (typeof STOCK_SORT_OPTIONS)[number]['id'];

function getActiveVariantStocks(product: Product) {
  return (product.variants ?? [])
    .filter((variant) => variant.isActive && Number.isFinite(variant.stockOverride))
    .map((variant) => Number(variant.stockOverride));
}

function getEffectiveStockForSort(product: Product) {
  const variantStocks = getActiveVariantStocks(product);
  if (!variantStocks.length) {
    return product.stock;
  }

  return Math.min(product.stock, ...variantStocks);
}

function getLowVariantLabels(product: Product) {
  return (product.variants ?? [])
    .filter(
      (variant) =>
        variant.isActive &&
        Number.isFinite(variant.stockOverride) &&
        Number(variant.stockOverride) <= Number(product.minStock),
    )
    .map((variant) => `${variant.value}: ${Number(variant.stockOverride)}`);
}

export function AdminProductsScreen() {
  const { theme } = useTheme();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [productFormExpanded, setProductFormExpanded] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockSort, setStockSort] = useState<StockSortOption>('newest');
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [variantsExpanded, setVariantsExpanded] = useState(false);
  const [variants, setVariants] = useState<ProductVariantFormState[]>([]);
  const [variantDraft, setVariantDraft] = useState<VariantDraftState>(EMPTY_VARIANT_DRAFT);
  // Category CRUD
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryIcon, setNewCategoryIcon] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryIcon, setEditCategoryIcon] = useState('');
  // Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editForm, setEditForm] = useState<ProductFormState>(EMPTY_FORM);
  const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
  const [editVariantsExpanded, setEditVariantsExpanded] = useState(false);
  const [editVariants, setEditVariants] = useState<ProductVariantFormState[]>([]);
  const [editVariantDraft, setEditVariantDraft] = useState<VariantDraftState>(EMPTY_VARIANT_DRAFT);
  const [editSaving, setEditSaving] = useState(false);
  const [editUploadProgress, setEditUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const showLoader = useMinimumLoader(loading, 500);

  const filteredProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    const selectedCategory = categoryFilter.trim().toLowerCase();
    let rows = products.filter((product) => {
      const matchesSearch =
        !keyword ||
        product.name.toLowerCase().includes(keyword) ||
        product.categoryName.toLowerCase().includes(keyword) ||
        (product.sku ?? '').toLowerCase().includes(keyword);
      const matchesCategory = selectedCategory === 'all' || product.categoryName.toLowerCase() === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    rows = [...rows].sort((a, b) => {
      if (stockSort === 'name_asc') {
        return a.name.localeCompare(b.name);
      }
      if (stockSort === 'stock_low') {
        return getEffectiveStockForSort(a) - getEffectiveStockForSort(b);
      }
      if (stockSort === 'stock_high') {
        return getEffectiveStockForSort(b) - getEffectiveStockForSort(a);
      }
      return 0;
    });

    return rows;
  }, [categoryFilter, productSearch, products, stockSort]);

  const loadProducts = async (targetPage = page) => {
    setLoading(true);
    try {
      const [next, availableCategories] = await Promise.all([
        fetchInventoryProducts({ page: targetPage, pageSize: PAGE_SIZE }),
        fetchAdminCategories(),
      ]);

      if (targetPage > 1 && next.length === 0) {
        setPage((prev) => Math.max(1, prev - 1));
        return;
      }

      setProducts(next);
      setHasNextPage(next.length === PAGE_SIZE);
      setCategories(availableCategories);
    } catch {
      setProducts([]);
      setHasNextPage(false);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts(page);
  }, [page]);

  const normalizeVariantRows = (rows: ProductVariantFormState[], basePrice: number) =>
    rows
      .map((row) => {
        const enteredPrice = row.priceDelta.trim() ? Number(row.priceDelta) : basePrice;
        const variantPrice = Number.isFinite(enteredPrice) ? enteredPrice : basePrice;
        const priceDelta = Number((variantPrice - basePrice).toFixed(2));
        const stockParsed = row.stockOverride.trim() ? Number(row.stockOverride) : null;
        return {
          id: row.id,
          name: row.name.trim(),
          value: row.value.trim(),
          priceDelta: Number.isFinite(priceDelta) ? priceDelta : 0,
          stockOverride: stockParsed === null || !Number.isFinite(stockParsed) ? undefined : Math.max(0, Math.round(stockParsed)),
          isActive: row.isActive,
        };
      })
      .filter((row) => row.name && row.value);

  const addVariantFromDraft = (
    draft: VariantDraftState,
    setDraft: React.Dispatch<React.SetStateAction<VariantDraftState>>,
    setRows: React.Dispatch<React.SetStateAction<ProductVariantFormState[]>>,
  ) => {
    const name = draft.name.trim();
    const value = draft.value.trim();
    if (!name || !value) {
      return;
    }

    setRows((prev) => {
      const key = `${name.toLowerCase()}::${value.toLowerCase()}`;
      if (prev.some((row) => `${row.name.trim().toLowerCase()}::${row.value.trim().toLowerCase()}` === key)) {
        return prev;
      }
      return [
        ...prev,
        {
          name,
          value,
          priceDelta: draft.priceDelta.trim(),
          stockOverride: draft.stockOverride.trim(),
          isActive: true,
        },
      ];
    });

    setDraft((prev) => ({ ...prev, value: '', priceDelta: '', stockOverride: '' }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImageUrls([]);
    setVariantsExpanded(false);
    setVariants([]);
    setVariantDraft(EMPTY_VARIANT_DRAFT);
    setUploadProgress(null);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.categoryName.trim() || !form.unit.trim()) {
      showAlert({ title: 'Missing fields', message: 'Product name, category, and unit are required.', tone: 'info' });
      return;
    }
    const cost = Number(form.cost);
    const price = Number(form.price);
    const stock = Number(form.stock);
    const minStock = Number(form.minStock || '0');
    const discountPercent = clampPercent(Number(form.discountPercent || '0'));
    const salePrice = computeSalePrice(price, discountPercent);
    const variantBasePrice = price;
    if (!Number.isFinite(cost) || !Number.isFinite(price) || !Number.isFinite(stock)) {
      showAlert({ title: 'Invalid numbers', message: 'Cost, price, and stock must be valid numbers.', tone: 'error' });
      return;
    }
    setSaving(true);
    try {
      await saveProduct({
        name: form.name.trim(),
        categoryName: form.categoryName.trim(),
        unit: form.unit.trim(),
        cost,
        price,
        stock,
        minStock,
        sku: form.sku.trim() || undefined,
        description: form.description.trim(),
        imageUrls,
        onSale: salePrice !== undefined,
        salePrice,
        variants: normalizeVariantRows(variants, variantBasePrice),
      });
      showAlert({ title: 'Saved', message: 'Product added.', tone: 'success' });
      resetForm();
      loadProducts();
    } catch (error) {
      showAlert({ title: 'Save failed', message: error instanceof Error ? error.message : 'Failed to save.', tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Edit Modal
  const openEditModal = (product: Product) => {
    setEditForm({
      id: product.id,
      name: product.name,
      categoryName: product.categoryName,
      unit: product.unit,
      cost: String(product.cost),
      price: String(product.price),
      stock: String(product.stock),
      minStock: String(product.minStock),
      sku: product.sku ?? '',
      discountPercent: String(getDiscountPercentFromPrice(product.price, product.salePrice, product.onSale) || ''),
      description: product.description ?? '',
    });
    setEditImageUrls((product.images ?? []).map((img) => img.imageUrl).slice(0, PRODUCT_IMAGE_LIMIT));
    setEditVariants(
      (product.variants ?? []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        value: variant.value,
        priceDelta: String(Number((product.price + (variant.priceDelta ?? 0)).toFixed(2))),
        stockOverride: variant.stockOverride === undefined ? '' : String(variant.stockOverride),
        isActive: variant.isActive ?? true,
      })),
    );
    setEditVariantsExpanded(false);
    setEditVariantDraft(EMPTY_VARIANT_DRAFT);
    setEditModalVisible(true);
  };

  const submitEditForm = async () => {
    if (!editForm.name.trim() || !editForm.categoryName.trim()) return;
    const cost = Number(editForm.cost);
    const price = Number(editForm.price);
    const stock = Number(editForm.stock);
    const minStock = Number(editForm.minStock || '0');
    const discountPercent = clampPercent(Number(editForm.discountPercent || '0'));
    const salePrice = computeSalePrice(price, discountPercent);
    const variantBasePrice = price;
    if (!Number.isFinite(cost) || !Number.isFinite(price) || !Number.isFinite(stock)) {
      showAlert({ title: 'Invalid numbers', message: 'Cost, price, and stock must be valid numbers.', tone: 'error' });
      return;
    }
    setEditSaving(true);
    try {
      await saveProduct({
        id: editForm.id,
        name: editForm.name.trim(),
        categoryName: editForm.categoryName.trim(),
        unit: editForm.unit.trim(),
        cost,
        price,
        stock,
        minStock,
        sku: editForm.sku.trim() || undefined,
        description: editForm.description.trim(),
        imageUrls: editImageUrls,
        onSale: salePrice !== undefined,
        salePrice,
        variants: normalizeVariantRows(editVariants, variantBasePrice),
      });
      setEditModalVisible(false);
      showAlert({ title: 'Updated', message: 'Product updated.', tone: 'success' });
      loadProducts();
    } catch (error) {
      showAlert({ title: 'Update failed', message: error instanceof Error ? error.message : 'Failed.', tone: 'error' });
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteProduct = (product: Product) => {
    showAlert({
      title: 'Delete Product',
      message: `Delete "${product.name}"?`,
      tone: 'error',
      actionLabel: 'Delete',
      onAction: async () => {
        try { await deleteProduct(product.id); loadProducts(); } catch { }
      },
    });
  };

  const restockProduct = async (product: Product) => {
    try {
      await saveProduct({
        id: product.id,
        name: product.name,
        categoryName: product.categoryName,
        unit: product.unit,
        cost: product.cost,
        price: product.price,
        stock: product.stock + 10,
        minStock: product.minStock,
        sku: product.sku,
        description: product.description,
        imageUrls: (product.images ?? []).map((img) => img.imageUrl).slice(0, PRODUCT_IMAGE_LIMIT),
        onSale: Boolean(product.onSale),
        salePrice: product.salePrice,
      });
      loadProducts();
    } catch (error) {
      showAlert({ title: 'Restock failed', message: error instanceof Error ? error.message : 'Unable to restock.', tone: 'error' });
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await saveCategory({ name: newCategoryName.trim(), icon: newCategoryIcon.trim() || undefined });
      setNewCategoryName('');
      setNewCategoryIcon('');
      loadProducts();
    } catch (error) {
      showAlert({ title: 'Failed', message: error instanceof Error ? error.message : 'Unable to add.', tone: 'error' });
    }
  };

  const handleUpdateCategory = async () => {
    if (!editCategoryId || !editCategoryName.trim()) return;
    try {
      await updateCategory({ id: editCategoryId, name: editCategoryName.trim(), icon: editCategoryIcon.trim() || undefined });
      setEditCategoryId(null);
      setEditCategoryName('');
      setEditCategoryIcon('');
      loadProducts();
    } catch (error) {
      showAlert({ title: 'Failed', message: error instanceof Error ? error.message : 'Unable to update.', tone: 'error' });
    }
  };

  const handleDeleteCategory = async (id: string) => {
    try { await deleteCategory(id); loadProducts(); } catch (error) {
      showAlert({ title: 'Failed', message: error instanceof Error ? error.message : 'Unable to delete.', tone: 'error' });
    }
  };

  const renderFormFields = (
    f: ProductFormState,
    setF: React.Dispatch<React.SetStateAction<ProductFormState>>,
    imgs: string[],
    setImgs: React.Dispatch<React.SetStateAction<string[]>>,
    imageUploadProgress: { completed: number; total: number } | null,
    setImageUploadProgress: React.Dispatch<React.SetStateAction<{ completed: number; total: number } | null>>,
    variantRows: ProductVariantFormState[],
    setVariantRows: React.Dispatch<React.SetStateAction<ProductVariantFormState[]>>,
    draft: VariantDraftState,
    setDraft: React.Dispatch<React.SetStateAction<VariantDraftState>>,
    variantsOpen: boolean,
    setVariantsOpen: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    const changeField = (key: keyof ProductFormState, value: string) => setF((prev) => ({ ...prev, [key]: value }));
    const fieldLabel = (label: string, required = false) => (
      <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
        {label}
        {required ? ' *' : ''}
      </Text>
    );
    const categoryQuery = f.categoryName.trim().toLowerCase();
    const categorySuggestions = categoryQuery
      ? categories.filter((category) => category.name.toLowerCase().includes(categoryQuery)).slice(0, 6)
      : categories.slice(0, 6);
    const presetValues = VARIANT_VALUE_PRESETS[draft.name.trim().toLowerCase()] ?? [];

    return (
      <>
        {fieldLabel('Product Name', true)}
        <TextInput
          value={f.name}
          onChangeText={(v) => changeField('name', v)}
          placeholder="Product name"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        {fieldLabel('Category', true)}
        <TextInput
          value={f.categoryName}
          onChangeText={(v) => changeField('categoryName', v)}
          placeholder="Category (type to search)"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        {categorySuggestions.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categorySuggestRow}>
            {categorySuggestions.map((cat) => {
              const active = f.categoryName.toLowerCase() === cat.name.toLowerCase();
              return (
                <Pressable
                  key={cat.id}
                  style={[
                    styles.categorySuggestChip,
                    { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt },
                  ]}
                  onPress={() => changeField('categoryName', cat.name)}
                >
                  <Text style={[styles.chipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                    {cat.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {fieldLabel('Unit', true)}
        <TextInput
          value={f.unit}
          onChangeText={(v) => changeField('unit', v)}
          placeholder="Unit"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {COMMON_UNITS.map((unit) => {
            const active = f.unit.toLowerCase() === unit.toLowerCase();
            return (
              <Pressable
                key={unit}
                style={[styles.chip, { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt }]}
                onPress={() => changeField('unit', unit)}
              >
                <Text style={[styles.chipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>{unit}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.row}>
          <View style={styles.half}>
            {fieldLabel('Cost', true)}
            <TextInput
              value={f.cost}
              onChangeText={(v) => changeField('cost', v)}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
          </View>
          <View style={styles.half}>
            {fieldLabel('Price', true)}
            <TextInput
              value={f.price}
              onChangeText={(v) => changeField('price', v)}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
          </View>
        </View>
        <View style={styles.row}>
          <View style={styles.half}>
            {fieldLabel('Discount %')}
            <TextInput
              value={f.discountPercent}
              onChangeText={(v) => changeField('discountPercent', v)}
              placeholder="0"
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
          </View>
          <View style={styles.half}>
            {fieldLabel('Sale Price')}
            <View style={[styles.input, styles.readonlyField, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
              <Text style={[styles.readonlyText, { color: theme.colors.text }]}>
                {(() => {
                  const basePrice = Number(f.price);
                  const percent = clampPercent(Number(f.discountPercent || '0'));
                  const salePrice = computeSalePrice(basePrice, percent);
                  return salePrice === undefined ? 'No sale' : formatPHP(salePrice);
                })()}
              </Text>
            </View>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {DISCOUNT_PRESETS.map((percent) => {
            const active = clampPercent(Number(f.discountPercent || '0')) === percent;
            return (
              <Pressable
                key={percent}
                style={[styles.chip, { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt }]}
                onPress={() => changeField('discountPercent', percent === 0 ? '' : String(percent))}
              >
                <Text style={[styles.chipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                  {percent === 0 ? 'No Sale' : `${percent}% Off`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.row}>
          <View style={styles.half}>
            {fieldLabel('Stock', true)}
            <TextInput
              value={f.stock}
              onChangeText={(v) => changeField('stock', v)}
              placeholder="0"
              keyboardType="number-pad"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
          </View>
          <View style={styles.half}>
            {fieldLabel('Low Stock Alert')}
            <TextInput
              value={f.minStock}
              onChangeText={(v) => changeField('minStock', v)}
              placeholder="5"
              keyboardType="number-pad"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
          </View>
        </View>

        <View style={[styles.variantCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <Pressable style={styles.collapsibleHeader} onPress={() => setVariantsOpen((prev) => !prev)}>
            <Text style={[styles.variantTitle, { color: theme.colors.text }]}>Variants (optional)</Text>
            <Ionicons name={variantsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
          </Pressable>

          {variantsOpen ? (
            <>
              <Text style={[styles.variantHint, { color: theme.colors.textMuted }]}>
                Add manual options like Color, Size, Weight, Volume, or custom choices.
                Variant price follows the same discount percent as the main product.
              </Text>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {VARIANT_NAME_PRESETS.map((name) => (
                  <Pressable
                    key={name}
                    style={[styles.chip, { backgroundColor: theme.colors.surfaceAlt }]}
                    onPress={() => setDraft((prev) => ({ ...prev, name }))}
                  >
                    <Text style={[styles.chipText, { color: theme.colors.text }]}>{name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <View style={styles.row}>
                <View style={styles.half}>
                  {fieldLabel('Variant Name')}
                  <TextInput
                    value={draft.name}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                    placeholder="e.g. Color"
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                  />
                </View>
                <View style={styles.half}>
                  {fieldLabel('Variant Value')}
                  <TextInput
                    value={draft.value}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, value }))}
                    placeholder="e.g. Blue"
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  {fieldLabel('Variant Price')}
                  <TextInput
                    value={draft.priceDelta}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, priceDelta: value }))}
                    placeholder={f.price || 'Same as base price'}
                    keyboardType="decimal-pad"
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                  />
                </View>
                <View style={styles.half}>
                  {fieldLabel('Stock Override')}
                  <TextInput
                    value={draft.stockOverride}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, stockOverride: value }))}
                    placeholder="optional"
                    keyboardType="number-pad"
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                  />
                </View>
                <Pressable
                  style={[styles.variantAddBtn, { backgroundColor: theme.colors.primary }]}
                  onPress={() => addVariantFromDraft(draft, setDraft, setVariantRows)}
                >
                  <Ionicons name="add" size={18} color={theme.colors.primaryContrast} />
                </Pressable>
              </View>

              {presetValues.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {presetValues.map((value) => (
                    <Pressable
                      key={value}
                      style={[styles.chip, { backgroundColor: theme.colors.surfaceAlt }]}
                      onPress={() => setDraft((prev) => ({ ...prev, value }))}
                    >
                      <Text style={[styles.chipText, { color: theme.colors.text }]}>{value}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}

              {variantRows.length ? (
                <View style={styles.variantList}>
                  {variantRows.map((variant, index) => (
                    <View key={`${variant.id ?? 'draft'}-${index}`} style={[styles.variantRowCard, { borderColor: theme.colors.border }]}>
                      <View style={styles.row}>
                        <View style={styles.half}>
                          {fieldLabel('Name')}
                          <TextInput
                            value={variant.name}
                            onChangeText={(value) =>
                              setVariantRows((prev) =>
                                prev.map((row, rowIndex) => (rowIndex === index ? { ...row, name: value } : row)),
                              )
                            }
                            placeholder="Name"
                            placeholderTextColor={theme.colors.textMuted}
                            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                          />
                        </View>
                        <View style={styles.half}>
                          {fieldLabel('Value')}
                          <TextInput
                            value={variant.value}
                            onChangeText={(value) =>
                              setVariantRows((prev) =>
                                prev.map((row, rowIndex) => (rowIndex === index ? { ...row, value } : row)),
                              )
                            }
                            placeholder="Value"
                            placeholderTextColor={theme.colors.textMuted}
                            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                          />
                        </View>
                      </View>
                      <View style={styles.row}>
                        <View style={styles.half}>
                          {fieldLabel('Variant Price')}
                          <TextInput
                            value={variant.priceDelta}
                            onChangeText={(value) =>
                              setVariantRows((prev) =>
                                prev.map((row, rowIndex) => (rowIndex === index ? { ...row, priceDelta: value } : row)),
                              )
                            }
                            placeholder={f.price || 'Same as base price'}
                            keyboardType="decimal-pad"
                            placeholderTextColor={theme.colors.textMuted}
                            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                          />
                        </View>
                        <View style={styles.half}>
                          {fieldLabel('Stock')}
                          <TextInput
                            value={variant.stockOverride}
                            onChangeText={(value) =>
                              setVariantRows((prev) =>
                                prev.map((row, rowIndex) => (rowIndex === index ? { ...row, stockOverride: value } : row)),
                              )
                            }
                            placeholder="optional"
                            keyboardType="number-pad"
                            placeholderTextColor={theme.colors.textMuted}
                            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                          />
                        </View>
                        <Pressable
                          style={[styles.iconBtnLg, { backgroundColor: variant.isActive ? theme.colors.success : theme.colors.surfaceAlt }]}
                          onPress={() =>
                            setVariantRows((prev) =>
                              prev.map((row, rowIndex) => (rowIndex === index ? { ...row, isActive: !row.isActive } : row)),
                            )
                          }
                        >
                          <Ionicons name={variant.isActive ? 'checkmark' : 'pause'} size={16} color="#FFFFFF" />
                        </Pressable>
                        <Pressable
                          style={[styles.iconBtnLg, { backgroundColor: theme.colors.surfaceAlt }]}
                          onPress={() => setVariantRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index))}
                        >
                          <Ionicons name="trash-outline" size={16} color={theme.colors.danger ?? '#EF4444'} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={[styles.variantHint, { color: theme.colors.textMuted }]}>No variants yet.</Text>
              )}
            </>
          ) : (
            <Text style={[styles.variantHint, { color: theme.colors.textMuted }]}>Collapsed by default. Tap to manage variants.</Text>
          )}
        </View>

        {fieldLabel('Description')}
        <TextInput
          value={f.description}
          onChangeText={(v) => changeField('description', v)}
          placeholder="Description"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          style={[styles.input, styles.multiline, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        <Pressable
          style={[styles.uploadBtn, { borderColor: theme.colors.border }]}
          onPress={async () => {
            if (imgs.length >= PRODUCT_IMAGE_LIMIT) {
              showAlert({ title: 'Image limit reached', message: `You can upload up to ${PRODUCT_IMAGE_LIMIT} images per product.`, tone: 'info' });
              return;
            }

            try {
              setImageUploadProgress({ completed: 0, total: Math.max(1, PRODUCT_IMAGE_LIMIT - imgs.length) });
              const urls = await pickAndUploadImages({
                bucket: 'product-media',
                folder: `products/${f.sku || f.name || Date.now().toString()}`,
                maxImages: Math.max(1, PRODUCT_IMAGE_LIMIT - imgs.length),
                targetBytes: 1_000_000,
                onProgress: (progress) => setImageUploadProgress(progress),
              });
              if (urls.length > 0) {
                setImgs((prev) => Array.from(new Set([...prev, ...urls])).slice(0, PRODUCT_IMAGE_LIMIT));
              }
            } catch (error) {
              showAlert({ title: 'Upload failed', message: error instanceof Error ? error.message : 'Unable to upload.', tone: 'error' });
            } finally {
              setImageUploadProgress(null);
            }
          }}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.text} />
          <Text style={[styles.uploadBtnText, { color: theme.colors.text }]}>
            Upload Images ({imgs.length}/{PRODUCT_IMAGE_LIMIT})
          </Text>
        </Pressable>
        {imageUploadProgress ? (
          <Text style={[styles.uploadProgressText, { color: theme.colors.textMuted }]}>
            Uploading {Math.min(imageUploadProgress.completed, imageUploadProgress.total)}/{imageUploadProgress.total}...
          </Text>
        ) : null}

        {imgs.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imgRow}>
            {imgs.map((url, i) => (
              <View key={i} style={styles.imgWrap}>
                <Image source={{ uri: url }} style={styles.imgThumb} />
                <Pressable style={styles.imgRemove} onPress={() => setImgs((prev) => prev.filter((_, idx) => idx !== i))}>
                  <Ionicons name="close-circle" size={16} color="#EF4444" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </>
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: 8 }]}
    >
      <SectionHeader title="Product Management" subtitle="Add, edit, and restock store inventory." />

      {/* ─── ADD PRODUCT (top) ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Pressable style={styles.collapsibleHeader} onPress={() => setProductFormExpanded((prev) => !prev)}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Add Product</Text>
          <Ionicons name={productFormExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
        </Pressable>
        {productFormExpanded ? (
          <>
            {renderFormFields(
              form,
              setForm,
              imageUrls,
              setImageUrls,
              uploadProgress,
              setUploadProgress,
              variants,
              setVariants,
              variantDraft,
              setVariantDraft,
              variantsExpanded,
              setVariantsExpanded,
            )}
            <View style={styles.row}>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: saving ? theme.colors.surfaceAlt : theme.colors.primary }]}
                disabled={saving}
                onPress={submitForm}
              >
                <Text style={[styles.primaryBtnText, { color: saving ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
                  {saving ? 'Saving...' : 'Add Product'}
                </Text>
              </Pressable>
              <Pressable style={[styles.outlineBtn, { borderColor: theme.colors.border }]} onPress={resetForm}>
                <Text style={[styles.outlineBtnText, { color: theme.colors.text }]}>Clear</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>

      {/* ─── CATEGORIES (2-col grid) ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Categories</Text>
        {/* Edit row — full width when editing */}
        {editCategoryId ? (
          <View style={[styles.catEditFullRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
            <TextInput value={editCategoryIcon} onChangeText={setEditCategoryIcon} placeholder="Icon"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.catIconInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]} />
            <TextInput value={editCategoryName} onChangeText={setEditCategoryName}
              style={[styles.catEditInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]} />
            <Pressable onPress={handleUpdateCategory} style={[styles.iconBtnLg, { backgroundColor: theme.colors.primary }]}>
              <Ionicons name="checkmark" size={18} color={theme.colors.primaryContrast} />
            </Pressable>
            <Pressable
              onPress={() => {
                setEditCategoryId(null);
                setEditCategoryName('');
                setEditCategoryIcon('');
              }}
              style={[styles.iconBtnLg, { backgroundColor: theme.colors.surfaceAlt }]}
            >
              <Ionicons name="close" size={18} color={theme.colors.text} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.catGrid}>
          {categories.map((cat) => (
            <View key={cat.id} style={[styles.catCell, { borderColor: theme.colors.border }]}>
              <View style={styles.catRow}>
                <Text style={styles.catEmoji}>{getCategoryIcon(cat.name, cat.icon)}</Text>
                <Text style={[styles.catName, { color: theme.colors.text }]} numberOfLines={1}>{cat.name}</Text>
                <Pressable onPress={() => { setEditCategoryId(cat.id); setEditCategoryName(cat.name); setEditCategoryIcon(cat.icon ?? ''); }} style={styles.catAction}>
                  <Ionicons name="pencil-outline" size={13} color={theme.colors.textMuted} />
                </Pressable>
                <Pressable onPress={() => handleDeleteCategory(cat.id)} style={styles.catAction}>
                  <Ionicons name="trash-outline" size={13} color={theme.colors.danger ?? '#EF4444'} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.addCatRow}>
          <View style={styles.iconField}>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Icon</Text>
            <TextInput value={newCategoryIcon} onChangeText={setNewCategoryIcon} placeholder="Icon" placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
          </View>
          <View style={styles.flexField}>
            <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Category Name</Text>
            <TextInput value={newCategoryName} onChangeText={setNewCategoryName} placeholder="New category" placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
          </View>
          <Pressable style={[styles.addCatBtn, { backgroundColor: theme.colors.primary }]} onPress={handleAddCategory}>
            <Ionicons name="add" size={18} color={theme.colors.primaryContrast} />
          </Pressable>
        </View>
      </View>

      {/* ─── PRODUCT LIST ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Find Product</Text>
        <TextInput
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Search by product, SKU, or category..."
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.searchInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          <Pressable
            style={[styles.filterChip, { backgroundColor: categoryFilter === 'all' ? theme.colors.primary : theme.colors.surfaceAlt }]}
            onPress={() => setCategoryFilter('all')}
          >
            <Text style={[styles.filterChipText, { color: categoryFilter === 'all' ? theme.colors.primaryContrast : theme.colors.text }]}>
              All Categories
            </Text>
          </Pressable>
          {categories.map((category) => {
            const categoryKey = category.name.toLowerCase();
            const active = categoryFilter === categoryKey;
            return (
              <Pressable
                key={category.id}
                style={[styles.filterChip, { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt }]}
                onPress={() => setCategoryFilter(categoryKey)}
              >
                <Text style={[styles.filterChipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                  {category.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STOCK_SORT_OPTIONS.map((option) => {
            const active = stockSort === option.id;
            return (
              <Pressable
                key={option.id}
                style={[styles.filterChip, { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt }]}
                onPress={() => setStockSort(option.id)}
              >
                <Text style={[styles.filterChipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {showLoader ? <BrandedLoader compact label="Loading inventory..." /> : null}
      {!loading && !filteredProducts.length ? (
        <EmptyState
          title="No products found"
          subtitle={products.length ? 'Try another search keyword or category filter.' : 'Add your first product above.'}
        />
      ) : null}

      <View style={styles.list}>
        {filteredProducts.map((product) => {
          const lowVariantLabels = getLowVariantLabels(product);
          const hasLowVariantStock = lowVariantLabels.length > 0;
          const displayStock = getEffectiveStockForSort(product);
          const isOutOfStock = displayStock <= 0;
          const isLowStock = displayStock <= product.minStock;

          return (
            <View key={product.id} style={[styles.prodCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <View style={styles.prodRow}>
                {product.imageUrl ? (
                  <Image source={{ uri: product.imageUrl }} style={styles.prodThumb} />
                ) : (
                  <View style={[styles.prodThumbFallback, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Ionicons name="basket-outline" size={18} color={theme.colors.textMuted} />
                  </View>
                )}
                <View style={styles.prodInfo}>
                  <Text style={[styles.prodName, { color: theme.colors.text }]} numberOfLines={1}>{product.name}</Text>
                  <Text style={[styles.prodMeta, { color: theme.colors.textMuted }]}>{product.categoryName} | {product.unit}</Text>
                  <Text style={[styles.prodMeta, { color: theme.colors.textMuted }]}>Cost: {formatPHP(product.cost)} | Price: {formatPHP(product.price)}</Text>
                  {product.onSale && product.salePrice !== undefined ? (
                    <Text style={[styles.prodMeta, { color: theme.colors.primary }]}>
                      On Sale: {formatPHP(product.salePrice)} ({getDiscountPercentFromPrice(product.price, product.salePrice, product.onSale)}% off)
                    </Text>
                  ) : null}
                  <Text style={[styles.prodMeta, { color: theme.colors.textMuted }]}>Variants: {(product.variants ?? []).filter((item) => item.isActive).length}</Text>
                  <Text style={[styles.stockText, { color: isOutOfStock ? theme.colors.danger : isLowStock ? theme.colors.warning : theme.colors.success }]}>
                    Stock: {displayStock}
                  </Text>
                  {hasLowVariantStock ? (
                    <Text style={[styles.variantLowText, { color: theme.colors.warning }]}>
                      Variant low stock: {lowVariantLabels.slice(0, 2).join(', ')}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.prodActions}>
                <Pressable style={[styles.actionBtn, { borderColor: theme.colors.border }]} onPress={() => openEditModal(product)}>
                  <Ionicons name="pencil-outline" size={13} color={theme.colors.text} />
                  <Text style={[styles.actionBtnText, { color: theme.colors.text }]}>Edit</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }]} onPress={() => restockProduct(product)}>
                  <Ionicons name="add-circle-outline" size={13} color="#FFF" />
                  <Text style={[styles.actionBtnText, { color: '#FFF' }]}>+10</Text>
                </Pressable>
                <Pressable style={[styles.actionBtn, { borderColor: theme.colors.danger ?? '#EF4444' }]} onPress={() => handleDeleteProduct(product)}>
                  <Ionicons name="trash-outline" size={13} color={theme.colors.danger ?? '#EF4444'} />
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      {products.length > 0 || page > 1 ? (
        <View style={styles.paginationRow}>
          <Pressable
            style={[
              styles.pageBtn,
              {
                borderColor: theme.colors.border,
                backgroundColor: page === 1 ? theme.colors.surfaceAlt : theme.colors.surface,
              },
            ]}
            disabled={page === 1 || loading}
            onPress={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            <Text style={[styles.pageBtnText, { color: page === 1 ? theme.colors.textMuted : theme.colors.text }]}>
              Previous
            </Text>
          </Pressable>
          <Text style={[styles.pageIndicator, { color: theme.colors.textMuted }]}>Page {page}</Text>
          <Pressable
            style={[
              styles.pageBtn,
              {
                borderColor: theme.colors.border,
                backgroundColor: !hasNextPage || loading ? theme.colors.surfaceAlt : theme.colors.surface,
              },
            ]}
            disabled={!hasNextPage || loading}
            onPress={() => setPage((prev) => prev + 1)}
          >
            <Text style={[styles.pageBtnText, { color: !hasNextPage || loading ? theme.colors.textMuted : theme.colors.text }]}>
              Next
            </Text>
          </Pressable>
        </View>
      ) : null}

      {/* ─── EDIT PRODUCT MODAL ─── */}
      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Edit Product</Text>
              <Pressable onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ rowGap: 8, paddingBottom: 16 }}>
              {renderFormFields(
                editForm,
                setEditForm,
                editImageUrls,
                setEditImageUrls,
                editUploadProgress,
                setEditUploadProgress,
                editVariants,
                setEditVariants,
                editVariantDraft,
                setEditVariantDraft,
                editVariantsExpanded,
                setEditVariantsExpanded,
              )}
            </ScrollView>
            <View style={[styles.modalFooter, { borderTopColor: theme.colors.border }]}>
              <Pressable style={[styles.outlineBtn, { borderColor: theme.colors.border }]} onPress={() => setEditModalVisible(false)}>
                <Text style={[styles.outlineBtnText, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.primaryBtn, { backgroundColor: editSaving ? theme.colors.surfaceAlt : theme.colors.primary }]} disabled={editSaving} onPress={submitEditForm}>
                <Text style={[styles.primaryBtnText, { color: editSaving ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { gap: 10, padding: 14 },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, rowGap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  collapsibleHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  searchInput: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 9 },
  filterRow: { gap: 6, paddingBottom: 2 },
  filterChip: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  filterChipText: { fontSize: 11, fontWeight: '700' },
  fieldLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 9 },
  readonlyField: { justifyContent: 'center' },
  readonlyText: { fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  multiline: { minHeight: 56, textAlignVertical: 'top' },
  chipRow: { gap: 6, paddingBottom: 2 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 11, fontWeight: '700' },
  categorySuggestRow: { gap: 6, paddingBottom: 2 },
  categorySuggestChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  variantCard: { borderRadius: 10, borderWidth: 1, gap: 8, padding: 10 },
  variantTitle: { fontSize: 13, fontWeight: '800' },
  variantHint: { fontSize: 11, fontWeight: '500' },
  variantAddBtn: { alignItems: 'center', borderRadius: 10, height: 38, justifyContent: 'center', width: 38 },
  variantList: { gap: 6 },
  variantRowCard: { borderRadius: 10, borderWidth: 1, gap: 6, padding: 8 },
  primaryBtn: { borderRadius: 10, flex: 1, paddingVertical: 11 },
  primaryBtnText: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  outlineBtn: { borderRadius: 10, borderWidth: 1, flex: 1, paddingVertical: 11 },
  outlineBtnText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  uploadBtn: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 10 },
  uploadBtnText: { fontSize: 12, fontWeight: '700' },
  uploadProgressText: { fontSize: 11, fontWeight: '600' },
  imgRow: { gap: 8, paddingVertical: 4 },
  imgWrap: { position: 'relative' },
  imgThumb: { borderRadius: 8, height: 56, width: 56 },
  imgRemove: { position: 'absolute', right: -4, top: -4 },
  helper: { fontSize: 13, fontWeight: '500' },
  // Categories 2-col grid
  catGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  catCell: { width: '50%', borderWidth: 0.5, paddingHorizontal: 8, paddingVertical: 6 },
  catRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  catEmoji: { fontSize: 14 },
  catName: { flex: 1, fontSize: 12, fontWeight: '600' },
  catAction: { padding: 3 },
  catEditFullRow: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 8 },
  catEditInput: { borderRadius: 8, borderWidth: 1, flex: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 8 },
  iconBtnLg: { alignItems: 'center', borderRadius: 8, height: 36, justifyContent: 'center', width: 36 },
  addCatRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 8 },
  iconField: { width: 70 },
  flexField: { flex: 1 },
  catIconInput: { borderRadius: 8, borderWidth: 1, fontSize: 16, paddingHorizontal: 10, paddingVertical: 8, width: 56 },
  addCatBtn: { alignItems: 'center', borderRadius: 10, height: 40, justifyContent: 'center', width: 40 },
  // Product list compact
  list: { gap: 8 },
  prodCard: { borderRadius: 12, borderWidth: 1, gap: 6, padding: 10 },
  prodRow: { flexDirection: 'row', gap: 10 },
  prodThumb: { borderRadius: 8, height: 50, width: 50 },
  prodThumbFallback: { alignItems: 'center', borderRadius: 8, height: 50, justifyContent: 'center', width: 50 },
  prodInfo: { flex: 1, gap: 1 },
  prodName: { fontSize: 13, fontWeight: '800' },
  prodMeta: { fontSize: 11, fontWeight: '500' },
  stockText: { fontSize: 11, fontWeight: '800' },
  variantLowText: { fontSize: 10, fontWeight: '700', marginTop: 2 },
  prodActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  actionBtnText: { fontSize: 11, fontWeight: '700' },
  paginationRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center', paddingTop: 4, paddingBottom: 8 },
  pageBtn: { borderRadius: 10, borderWidth: 1, minWidth: 96, paddingHorizontal: 14, paddingVertical: 9 },
  pageBtnText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  pageIndicator: { fontSize: 12, fontWeight: '700' },
  // Edit modal
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center', padding: 16 },
  modalContent: { borderRadius: 16, borderWidth: 1, maxHeight: '90%', overflow: 'hidden' },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  modalScroll: { paddingHorizontal: 14 },
  modalFooter: { borderTopWidth: 1, flexDirection: 'row', gap: 8, padding: 14 },
});
