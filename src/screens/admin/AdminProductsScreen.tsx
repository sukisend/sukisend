import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { EmptyState } from '../../components/EmptyState';
import { SectionHeader } from '../../components/SectionHeader';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useTheme } from '../../providers/ThemeProvider';
import { pickAndUploadImages } from '../../services/mediaService';
import { fetchAdminCategories, fetchInventoryProducts, saveProduct } from '../../services/adminService';
import { Category, Product } from '../../types/models';
import { formatPHP } from '../../utils/currency';

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

  const onChange = (key: keyof ProductFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImageUrls([]);
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.categoryName.trim() || !form.unit.trim()) {
      showAlert({
        title: 'Missing fields',
        message: 'Product name, category, and unit are required.',
        tone: 'info',
      });
      return;
    }

    const cost = Number(form.cost);
    const price = Number(form.price);
    const stock = Number(form.stock);
    const minStock = Number(form.minStock || '0');

    if (!Number.isFinite(cost) || !Number.isFinite(price) || !Number.isFinite(stock)) {
      showAlert({
        title: 'Invalid numbers',
        message: 'Cost, price, and stock must be valid numbers.',
        tone: 'error',
      });
      return;
    }

    setSaving(true);
    try {
      await saveProduct({
        id: form.id,
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
      });

      showAlert({
        title: 'Saved',
        message: 'Product record updated.',
        tone: 'success',
      });
      resetForm();
      loadProducts();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save product.';
      showAlert({
        title: 'Save failed',
        message,
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const editProduct = (product: Product) => {
    setForm({
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
    setImageUrls((product.images ?? []).map((image) => image.imageUrl).slice(0, 5));
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
        imageUrls: (product.images ?? []).map((image) => image.imageUrl).slice(0, 5),
      });
      loadProducts();
    } catch (error) {
      showAlert({
        title: 'Restock failed',
        message: error instanceof Error ? error.message : 'Unable to restock product.',
        tone: 'error',
      });
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 22 }]}
    >
      <SectionHeader title="Product Management" subtitle="Add, edit, and restock store inventory." />

      <View style={[styles.formCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.formTitle, { color: theme.colors.text }]}>{form.id ? 'Edit Product' : 'Add Product'}</Text>

        <TextInput
          value={form.name}
          onChangeText={(value) => onChange('name', value)}
          placeholder="Product name"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />
        <TextInput
          value={form.categoryName}
          onChangeText={(value) => onChange('categoryName', value)}
          placeholder="Category"
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
        />

        {categories.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {categories.map((category) => {
              const active = form.categoryName.toLowerCase() === category.name.toLowerCase();
              return (
                <Pressable
                  key={category.id}
                  style={[
                    styles.categoryChip,
                    {
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                    },
                  ]}
                  onPress={() => onChange('categoryName', category.name)}
                >
                  <Text style={[styles.categoryChipText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.row}>
          <TextInput
            value={form.unit}
            onChangeText={(value) => onChange('unit', value)}
            placeholder="Unit (pcs, pack)"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              styles.halfInput,
              { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
            ]}
          />
          <TextInput
            value={form.sku}
            onChangeText={(value) => onChange('sku', value)}
            placeholder="SKU (optional)"
            placeholderTextColor={theme.colors.textMuted}
            style={[
              styles.input,
              styles.halfInput,
              { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
            ]}
          />
        </View>

        <View style={styles.row}>
          <TextInput
            value={form.cost}
            onChangeText={(value) => onChange('cost', value)}
            placeholder="Cost"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
            style={[
              styles.input,
              styles.halfInput,
              { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
            ]}
          />
          <TextInput
            value={form.price}
            onChangeText={(value) => onChange('price', value)}
            placeholder="Selling Price"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="decimal-pad"
            style={[
              styles.input,
              styles.halfInput,
              { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
            ]}
          />
        </View>

        <View style={styles.row}>
          <TextInput
            value={form.stock}
            onChangeText={(value) => onChange('stock', value)}
            placeholder="Stock"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            style={[
              styles.input,
              styles.halfInput,
              { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
            ]}
          />
          <TextInput
            value={form.minStock}
            onChangeText={(value) => onChange('minStock', value)}
            placeholder="Min Stock Alert"
            placeholderTextColor={theme.colors.textMuted}
            keyboardType="number-pad"
            style={[
              styles.input,
              styles.halfInput,
              { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
            ]}
          />
        </View>

        <TextInput
          value={form.description}
          onChangeText={(value) => onChange('description', value)}
          placeholder="Description"
          placeholderTextColor={theme.colors.textMuted}
          multiline
          style={[
            styles.input,
            styles.multiline,
            { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface },
          ]}
        />

        <Pressable
          style={[styles.ghostButton, { borderColor: theme.colors.border }]}
          onPress={async () => {
            try {
              const urls = await pickAndUploadImages({
                bucket: 'product-media',
                folder: `products/${form.sku || form.name || Date.now().toString()}`,
                maxImages: 5,
              });
              setImageUrls(urls.slice(0, 5));
            } catch (error) {
              showAlert({
                title: 'Upload failed',
                message: error instanceof Error ? error.message : 'Unable to upload product photos.',
                tone: 'error',
              });
            }
          }}
        >
          <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>Upload Product Images ({imageUrls.length}/5)</Text>
        </Pressable>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.button, { backgroundColor: saving ? theme.colors.surfaceAlt : theme.colors.primary }]}
            disabled={saving}
            onPress={submitForm}
          >
            <Text style={[styles.buttonText, { color: saving ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
              {saving ? 'Saving...' : form.id ? 'Update Product' : 'Add Product'}
            </Text>
          </Pressable>
          <Pressable style={[styles.ghostButton, { borderColor: theme.colors.border }]} onPress={resetForm}>
            <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>Clear</Text>
          </Pressable>
        </View>
      </View>

      {loading ? <Text style={[styles.helper, { color: theme.colors.textMuted }]}>Loading inventory...</Text> : null}
      {!loading && !products.length ? (
        <EmptyState title="No products found" subtitle="Add your first product from the form above." />
      ) : null}

      <View style={styles.list}>
        {products.map((product) => (
          <View key={product.id} style={[styles.productCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <Text style={[styles.productName, { color: theme.colors.text }]}>{product.name}</Text>
            <Text style={[styles.productMeta, { color: theme.colors.textMuted }]}>
              {product.categoryName} | {product.unit} | {product.sku}
            </Text>
            <Text style={[styles.productMeta, { color: theme.colors.textMuted }]}>
              Cost: {formatPHP(product.cost)} | Price: {formatPHP(product.price)} | Profit: {formatPHP(product.price - product.cost)}
            </Text>
            <Text
              style={[
                styles.stockStatus,
                {
                  color: product.stock <= 0 ? theme.colors.danger : product.stock <= product.minStock ? theme.colors.warning : theme.colors.success,
                },
              ]}
            >
              Stock: {product.stock}
            </Text>

            <View style={styles.actionRow}>
              <Pressable style={[styles.ghostButton, { borderColor: theme.colors.border }]} onPress={() => editProduct(product)}>
                <Text style={[styles.ghostButtonText, { color: theme.colors.text }]}>Edit</Text>
              </Pressable>
              <Pressable style={[styles.button, { backgroundColor: theme.colors.accent }]} onPress={() => restockProduct(product)}>
                <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Restock +10</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 10,
    padding: 14,
  },
  formCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    rowGap: 8,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 2,
  },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryRow: {
    gap: 8,
    paddingBottom: 2,
  },
  categoryChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  halfInput: {
    flex: 1,
  },
  multiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    borderRadius: 10,
    flex: 1,
    paddingVertical: 11,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  ghostButton: {
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 11,
  },
  ghostButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  helper: {
    fontSize: 13,
    fontWeight: '500',
  },
  list: {
    gap: 10,
  },
  productCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  productName: {
    fontSize: 15,
    fontWeight: '800',
  },
  productMeta: {
    fontSize: 12,
    fontWeight: '500',
  },
  stockStatus: {
    fontSize: 13,
    fontWeight: '800',
    marginTop: 2,
  },
});
