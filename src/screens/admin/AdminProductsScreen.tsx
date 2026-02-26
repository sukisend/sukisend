import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { useBrandAlert } from '../../hooks/useBrandAlert';
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
  description: '',
};
const EMPTY_VARIANT_DRAFT: VariantDraftState = { name: '', value: '', priceDelta: '0', stockOverride: '' };
const COMMON_UNITS = ['pcs', 'kg', 'g', 'oz', 'ml', 'L', 'cm', 'inch', 'box', 'pack'];
const VARIANT_NAME_PRESETS = ['Color', 'Size', 'Weight', 'Volume', 'Length', 'Material', 'Pack'];
const VARIANT_VALUE_PRESETS: Record<string, string[]> = {
  color: ['Orange', 'Blue', 'Red', 'Green', 'Black', 'White'],
  size: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  weight: ['100g', '250g', '500g', '1kg', '2kg'],
  volume: ['100ml', '250ml', '500ml', '1L', '2L'],
  length: ['5cm', '10cm', '20cm', '30cm', '1in', '2in', '3in'],
  pack: ['1 pc', '3 pcs', '6 pcs', '12 pcs'],
};

export function AdminProductsScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { theme } = useTheme();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
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
  const [editVariants, setEditVariants] = useState<ProductVariantFormState[]>([]);
  const [editVariantDraft, setEditVariantDraft] = useState<VariantDraftState>(EMPTY_VARIANT_DRAFT);
  const [editSaving, setEditSaving] = useState(false);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const [next, availableCategories] = await Promise.all([fetchInventoryProducts(), fetchAdminCategories()]);
      setProducts(next);
      setCategories(availableCategories);
    } catch {
      setProducts([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const normalizeVariantRows = (rows: ProductVariantFormState[]) =>
    rows
      .map((row) => {
        const priceDelta = Number(row.priceDelta || '0');
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
          priceDelta: draft.priceDelta.trim() || '0',
          stockOverride: draft.stockOverride.trim(),
          isActive: true,
        },
      ];
    });

    setDraft((prev) => ({ ...prev, value: '', priceDelta: '0', stockOverride: '' }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImageUrls([]);
    setVariants([]);
    setVariantDraft(EMPTY_VARIANT_DRAFT);
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
        variants: normalizeVariantRows(variants),
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
      description: product.description ?? '',
    });
    setEditImageUrls((product.images ?? []).map((img) => img.imageUrl).slice(0, 5));
    setEditVariants(
      (product.variants ?? []).map((variant) => ({
        id: variant.id,
        name: variant.name,
        value: variant.value,
        priceDelta: String(variant.priceDelta ?? 0),
        stockOverride: variant.stockOverride === undefined ? '' : String(variant.stockOverride),
        isActive: variant.isActive ?? true,
      })),
    );
    setEditVariantDraft(EMPTY_VARIANT_DRAFT);
    setEditModalVisible(true);
  };

  const submitEditForm = async () => {
    if (!editForm.name.trim() || !editForm.categoryName.trim()) return;
    const cost = Number(editForm.cost);
    const price = Number(editForm.price);
    const stock = Number(editForm.stock);
    const minStock = Number(editForm.minStock || '0');
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
        variants: normalizeVariantRows(editVariants),
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
      await saveProduct({ id: product.id, name: product.name, categoryName: product.categoryName, unit: product.unit, cost: product.cost, price: product.price, stock: product.stock + 10, minStock: product.minStock, sku: product.sku, description: product.description, imageUrls: (product.images ?? []).map((img) => img.imageUrl).slice(0, 5) });
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
    variantRows: ProductVariantFormState[],
    setVariantRows: React.Dispatch<React.SetStateAction<ProductVariantFormState[]>>,
    draft: VariantDraftState,
    setDraft: React.Dispatch<React.SetStateAction<VariantDraftState>>,
  ) => {
    const changeField = (key: keyof ProductFormState, value: string) => setF((prev) => ({ ...prev, [key]: value }));
    const categoryQuery = f.categoryName.trim().toLowerCase();
    const categorySuggestions = categoryQuery
      ? categories.filter((category) => category.name.toLowerCase().includes(categoryQuery)).slice(0, 6)
      : categories.slice(0, 6);
    const presetValues = VARIANT_VALUE_PRESETS[draft.name.trim().toLowerCase()] ?? [];

    return (
      <>
        <TextInput
          value={f.name}
          onChangeText={(v) => changeField('name', v)}
          placeholder="Product name"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

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

        <View style={styles.row}>
          <TextInput
            value={f.unit}
            onChangeText={(v) => changeField('unit', v)}
            placeholder="Unit"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <TextInput
            value={f.sku}
            onChangeText={(v) => changeField('sku', v)}
            placeholder="SKU (opt)"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>

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
          <TextInput
            value={f.cost}
            onChangeText={(v) => changeField('cost', v)}
            placeholder="Cost"
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <TextInput
            value={f.price}
            onChangeText={(v) => changeField('price', v)}
            placeholder="Price"
            keyboardType="decimal-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>
        <View style={styles.row}>
          <TextInput
            value={f.stock}
            onChangeText={(v) => changeField('stock', v)}
            placeholder="Stock"
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <TextInput
            value={f.minStock}
            onChangeText={(v) => changeField('minStock', v)}
            placeholder="Min Alert"
            keyboardType="number-pad"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>

        <View style={[styles.variantCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          <Text style={[styles.variantTitle, { color: theme.colors.text }]}>Variants (optional)</Text>
          <Text style={[styles.variantHint, { color: theme.colors.textMuted }]}>
            Add manual options like Color, Size, Weight, Volume, or custom choices.
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
            <TextInput
              value={draft.name}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              placeholder="Variant name (e.g. Color)"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
            />
            <TextInput
              value={draft.value}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, value }))}
              placeholder="Variant value (e.g. Blue)"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
            />
          </View>
          <View style={styles.row}>
            <TextInput
              value={draft.priceDelta}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, priceDelta: value }))}
              placeholder="Price +/-"
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
            />
            <TextInput
              value={draft.stockOverride}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, stockOverride: value }))}
              placeholder="Stock override"
              keyboardType="number-pad"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
            />
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
                    <TextInput
                      value={variant.name}
                      onChangeText={(value) =>
                        setVariantRows((prev) =>
                          prev.map((row, rowIndex) => (rowIndex === index ? { ...row, name: value } : row)),
                        )
                      }
                      placeholder="Name"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                    />
                    <TextInput
                      value={variant.value}
                      onChangeText={(value) =>
                        setVariantRows((prev) =>
                          prev.map((row, rowIndex) => (rowIndex === index ? { ...row, value } : row)),
                        )
                      }
                      placeholder="Value"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                    />
                  </View>
                  <View style={styles.row}>
                    <TextInput
                      value={variant.priceDelta}
                      onChangeText={(value) =>
                        setVariantRows((prev) =>
                          prev.map((row, rowIndex) => (rowIndex === index ? { ...row, priceDelta: value } : row)),
                        )
                      }
                      placeholder="Price +/-"
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                    />
                    <TextInput
                      value={variant.stockOverride}
                      onChangeText={(value) =>
                        setVariantRows((prev) =>
                          prev.map((row, rowIndex) => (rowIndex === index ? { ...row, stockOverride: value } : row)),
                        )
                      }
                      placeholder="Stock"
                      keyboardType="number-pad"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, styles.half, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                    />
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
        </View>

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
            try {
              const urls = await pickAndUploadImages({
                bucket: 'product-media',
                folder: `products/${f.sku || f.name || Date.now().toString()}`,
                maxImages: 5,
              });
              if (urls.length > 0) setImgs(urls.slice(0, 5));
            } catch (error) {
              showAlert({ title: 'Upload failed', message: error instanceof Error ? error.message : 'Unable to upload.', tone: 'error' });
            }
          }}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.text} />
          <Text style={[styles.uploadBtnText, { color: theme.colors.text }]}>Upload Images ({imgs.length}/5)</Text>
        </Pressable>

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
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 22 }]}
    >
      <SectionHeader title="Product Management" subtitle="Add, edit, and restock store inventory." />

      {/* ─── ADD PRODUCT (top) ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Add Product</Text>
        {renderFormFields(form, setForm, imageUrls, setImageUrls, variants, setVariants, variantDraft, setVariantDraft)}
        <View style={styles.row}>
          <Pressable style={[styles.primaryBtn, { backgroundColor: saving ? theme.colors.surfaceAlt : theme.colors.primary }]} disabled={saving} onPress={submitForm}>
            <Text style={[styles.primaryBtnText, { color: saving ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
              {saving ? 'Saving...' : 'Add Product'}
            </Text>
          </Pressable>
          <Pressable style={[styles.outlineBtn, { borderColor: theme.colors.border }]} onPress={resetForm}>
            <Text style={[styles.outlineBtnText, { color: theme.colors.text }]}>Clear</Text>
          </Pressable>
        </View>
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
          <TextInput value={newCategoryIcon} onChangeText={setNewCategoryIcon} placeholder="Icon" placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, styles.iconField, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
          <TextInput value={newCategoryName} onChangeText={setNewCategoryName} placeholder="New category" placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { flex: 1, borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
          <Pressable style={[styles.addCatBtn, { backgroundColor: theme.colors.primary }]} onPress={handleAddCategory}>
            <Ionicons name="add" size={18} color={theme.colors.primaryContrast} />
          </Pressable>
        </View>
      </View>

      {/* ─── PRODUCT LIST ─── */}
      {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading...</Text> : null}
      {!loading && !products.length ? <EmptyState title="No products" subtitle="Add your first product above." /> : null}

      <View style={styles.list}>
        {products.map((product) => (
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
                <Text style={[styles.prodMeta, { color: theme.colors.textMuted }]}>{product.categoryName} | {product.unit} | {product.sku}</Text>
                <Text style={[styles.prodMeta, { color: theme.colors.textMuted }]}>Cost: {formatPHP(product.cost)} | Price: {formatPHP(product.price)}</Text>
                <Text style={[styles.prodMeta, { color: theme.colors.textMuted }]}>Variants: {(product.variants ?? []).filter((item) => item.isActive).length}</Text>
                <Text style={[styles.stockText, { color: product.stock <= 0 ? theme.colors.danger : product.stock <= product.minStock ? theme.colors.warning : theme.colors.success }]}>
                  Stock: {product.stock}
                </Text>
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
        ))}
      </View>

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
                editVariants,
                setEditVariants,
                editVariantDraft,
                setEditVariantDraft,
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
  input: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 9 },
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
  addCatRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  iconField: { width: 64 },
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
  prodActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 5 },
  actionBtnText: { fontSize: 11, fontWeight: '700' },
  // Edit modal
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center', padding: 16 },
  modalContent: { borderRadius: 16, borderWidth: 1, maxHeight: '90%', overflow: 'hidden' },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  modalScroll: { paddingHorizontal: 14 },
  modalFooter: { borderTopWidth: 1, flexDirection: 'row', gap: 8, padding: 14 },
});
