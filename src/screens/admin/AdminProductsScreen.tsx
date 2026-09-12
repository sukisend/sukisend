import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutAnimation, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, UIManager, View } from 'react-native';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { BrandedLoader } from '../../components/BrandedLoader';
import { EmptyState } from '../../components/EmptyState';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { QuantityStepper } from '../../components/QuantityStepper';
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
  restockProduct as apiRestockProduct,
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
  imageUrl: string;
  isActive: boolean;
}

interface VariantDraftState {
  name: string;
  value: string;
  priceDelta: string;
  stockOverride: string;
  imageUrl: string;
}

type ProductFormStep = 'details' | 'pricing' | 'stock' | 'variants' | 'photos';

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
const EMPTY_VARIANT_DRAFT: VariantDraftState = { name: '', value: '', priceDelta: '', stockOverride: '', imageUrl: '' };
const PAGE_SIZE = 8;
const PRODUCT_IMAGE_LIMIT = 20;
const PRODUCT_FORM_STEPS: Array<{ id: ProductFormStep; label: string }> = [
  { id: 'details', label: 'Details' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'stock', label: 'Stock' },
  { id: 'variants', label: 'Variants' },
  { id: 'photos', label: 'Photos' },
];
const STOCK_SORT_OPTIONS = [
  { id: 'stock_low', label: 'Low-High Stock' },
  { id: 'stock_high', label: 'High-Low Stock' },
  { id: 'newest', label: 'Newest' },
  { id: 'name_asc', label: 'A-Z' },
] as const;
type StockSortOption = (typeof STOCK_SORT_OPTIONS)[number]['id'];

function getActiveVariantStocks(product: Product) {
  return (product.variants ?? [])
    .filter((variant) => variant.isActive && Number.isFinite(variant.stockOverride))
    .map((variant) => Number(variant.stockOverride));
}

function hasTrackedVariants(product: Product) {
  return getActiveVariantStocks(product).length > 0;
}

function rowsHaveVariantStock(rows: Array<{ isActive?: boolean; stockOverride?: number }>) {
  return rows.some((row) => row.isActive !== false && Number.isFinite(row.stockOverride));
}

function sumVariantStock(rows: Array<{ isActive?: boolean; stockOverride?: number }>) {
  return rows.reduce((total, row) => {
    if (row.isActive === false || !Number.isFinite(row.stockOverride)) {
      return total;
    }
    return total + Number(row.stockOverride);
  }, 0);
}

function getEffectiveStockForSort(product: Product) {
  const variantStocks = getActiveVariantStocks(product);
  if (!variantStocks.length) {
    return product.stock;
  }

  return variantStocks.reduce((total, stock) => total + stock, 0);
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
  const [productFormStep, setProductFormStep] = useState<ProductFormStep>('details');
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockSort, setStockSort] = useState<StockSortOption>('stock_low');
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [variantsExpanded, setVariantsExpanded] = useState(true);
  const [variants, setVariants] = useState<ProductVariantFormState[]>([]);
  const [variantDraft, setVariantDraft] = useState<VariantDraftState>(EMPTY_VARIANT_DRAFT);
  // Category CRUD
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryImageUrl, setNewCategoryImageUrl] = useState('');
  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editCategoryImageUrl, setEditCategoryImageUrl] = useState('');
  const [catActionVisible, setCatActionVisible] = useState(false);
  const [selectedCat, setSelectedCat] = useState<Category | null>(null);
  // Edit Modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editFormStep, setEditFormStep] = useState<ProductFormStep>('details');
  const [editForm, setEditForm] = useState<ProductFormState>(EMPTY_FORM);
  const [editImageUrls, setEditImageUrls] = useState<string[]>([]);
  const [editVariantsExpanded, setEditVariantsExpanded] = useState(false);
  const [editVariants, setEditVariants] = useState<ProductVariantFormState[]>([]);
  const [editVariantDraft, setEditVariantDraft] = useState<VariantDraftState>(EMPTY_VARIANT_DRAFT);
  const [editSaving, setEditSaving] = useState(false);
  const [editUploadProgress, setEditUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  // Restock Modal
  const [restockVisible, setRestockVisible] = useState(false);
  const [restockTarget, setRestockTarget] = useState<Product | null>(null);
  const [restockBaseQty, setRestockBaseQty] = useState(0);
  const [restockVariantQtys, setRestockVariantQtys] = useState<Record<string, number>>({});
  const [restockSaving, setRestockSaving] = useState(false);
  const productStepAnim = useRef(new Animated.Value(1)).current;
  const editStepAnim = useRef(new Animated.Value(1)).current;
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

  const visibleCategories = useMemo(
    () => categories.filter((cat) => cat.name.toLowerCase() !== 'empty' && cat.name.trim() !== ''),
    [categories],
  );

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

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const animateStepChange = (changeStep: () => void) => {
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    changeStep();
  };

  useEffect(() => {
    productStepAnim.setValue(0);
    Animated.timing(productStepAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [productFormStep, productStepAnim]);

  useEffect(() => {
    editStepAnim.setValue(0);
    Animated.timing(editStepAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [editFormStep, editStepAnim]);

  const getStepTransitionStyle = (animation: Animated.Value) => ({
    opacity: animation,
    transform: [
      {
        translateY: animation.interpolate({
          inputRange: [0, 1],
          outputRange: [12, 0],
        }),
      },
    ],
  });

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
          imageUrl: row.imageUrl?.trim() || undefined,
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
          imageUrl: draft.imageUrl.trim(),
          isActive: true,
        },
      ];
    });

    setDraft((prev) => ({ ...prev, value: '', priceDelta: '', stockOverride: '', imageUrl: '' }));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImageUrls([]);
    setVariantsExpanded(true);
    setVariants([]);
    setVariantDraft(EMPTY_VARIANT_DRAFT);
    setUploadProgress(null);
    setProductFormStep('details');
  };

  const submitForm = async () => {
    if (!form.name.trim() || !form.categoryName.trim() || !form.unit.trim()) {
      showAlert({ title: 'Missing fields', message: 'Product name, category, and unit are required.', tone: 'info' });
      return;
    }
    if (!isSelectedCategory(form.categoryName)) {
      showAlert({ title: 'Choose a category', message: 'Please select one of your created categories before saving.', tone: 'info' });
      return;
    }
    const cost = Number(form.cost);
    const price = Number(form.price);
    const enteredStock = Number(form.stock);
    const minStock = Number(form.minStock || '0');
    const discountPercent = clampPercent(Number(form.discountPercent || '0'));
    const salePrice = computeSalePrice(price, discountPercent);
    const variantBasePrice = price;
    const normalizedVariants = normalizeVariantRows(variants, variantBasePrice);
    if (!Number.isFinite(cost) || !Number.isFinite(price) || !Number.isFinite(enteredStock)) {
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
        stock: rowsHaveVariantStock(normalizedVariants) ? sumVariantStock(normalizedVariants) : enteredStock,
        minStock,
        sku: form.sku.trim() || undefined,
        description: form.description.trim(),
        imageUrls,
        onSale: salePrice !== undefined,
        salePrice,
        variants: normalizedVariants,
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
        imageUrl: variant.imageUrl ?? '',
        isActive: variant.isActive ?? true,
      })),
    );
    setEditVariantsExpanded(true);
    setEditVariantDraft(EMPTY_VARIANT_DRAFT);
    setEditFormStep('details');
    setEditModalVisible(true);
  };

  const submitEditForm = async () => {
    if (!editForm.name.trim() || !editForm.categoryName.trim()) return;
    if (!isSelectedCategory(editForm.categoryName)) {
      showAlert({ title: 'Choose a category', message: 'Please select one of your created categories before saving.', tone: 'info' });
      return;
    }
    const cost = Number(editForm.cost);
    const price = Number(editForm.price);
    const enteredStock = Number(editForm.stock);
    const minStock = Number(editForm.minStock || '0');
    const discountPercent = clampPercent(Number(editForm.discountPercent || '0'));
    const salePrice = computeSalePrice(price, discountPercent);
    const variantBasePrice = price;
    const normalizedVariants = normalizeVariantRows(editVariants, variantBasePrice);
    if (!Number.isFinite(cost) || !Number.isFinite(price) || !Number.isFinite(enteredStock)) {
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
        stock: rowsHaveVariantStock(normalizedVariants) ? sumVariantStock(normalizedVariants) : enteredStock,
        minStock,
        sku: editForm.sku.trim() || undefined,
        description: editForm.description.trim(),
        imageUrls: editImageUrls,
        onSale: salePrice !== undefined,
        salePrice,
        variants: normalizedVariants,
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

  const openRestockModal = (product: Product) => {
    setRestockTarget(product);
    setRestockBaseQty(0);
    const variantQtys: Record<string, number> = {};
    product.variants?.forEach((v) => { variantQtys[v.id] = 0; });
    setRestockVariantQtys(variantQtys);
    setRestockVisible(true);
  };

  const submitRestock = async () => {
    if (!restockTarget) return;
    const variantProduct = hasTrackedVariants(restockTarget);
    const totalDelta = variantProduct
      ? Object.values(restockVariantQtys).reduce((a, b) => a + b, 0)
      : restockBaseQty;
    if (totalDelta <= 0) {
      setRestockVisible(false);
      return;
    }
    setRestockSaving(true);
    try {
      await apiRestockProduct(restockTarget.id, variantProduct ? 0 : restockBaseQty, restockVariantQtys);
      setRestockVisible(false);
      loadProducts();
      showAlert({
        title: 'Restocked',
        message: `${restockTarget.name} stock updated by +${totalDelta}.`,
        tone: 'success',
      });
    } catch (error) {
      showAlert({ title: 'Restock failed', message: error instanceof Error ? error.message : 'Unable to restock.', tone: 'error' });
    } finally {
      setRestockSaving(false);
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await saveCategory({ name: newCategoryName.trim(), imageUrl: newCategoryImageUrl || undefined });
      setNewCategoryName('');
      setNewCategoryImageUrl('');
      loadProducts();
    } catch (error) {
      showAlert({ title: 'Failed', message: error instanceof Error ? error.message : 'Unable to add.', tone: 'error' });
    }
  };

  const handleUpdateCategory = async () => {
    if (!editCategoryId || !editCategoryName.trim()) return;
    try {
      await updateCategory({ id: editCategoryId, name: editCategoryName.trim(), imageUrl: editCategoryImageUrl || undefined });
      setEditCategoryId(null);
      setEditCategoryName('');
      setEditCategoryImageUrl('');
      loadProducts();
    } catch (error) {
      showAlert({ title: 'Failed', message: error instanceof Error ? error.message : 'Unable to update.', tone: 'error' });
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    showAlert({
      title: 'Delete Category',
      message: `Delete "${name}"? Products in this category won't be deleted.`,
      tone: 'error',
      actionLabel: 'Delete',
      cancelLabel: 'Cancel',
      onAction: async () => {
        try { await deleteCategory(id); loadProducts(); } catch (error) {
          showAlert({ title: 'Failed', message: error instanceof Error ? error.message : 'Unable to delete.', tone: 'error' });
        }
      },
    });
  };

  const getStepIndex = (step: ProductFormStep) => PRODUCT_FORM_STEPS.findIndex((item) => item.id === step);
  const getPreviousStep = (step: ProductFormStep) => PRODUCT_FORM_STEPS[Math.max(0, getStepIndex(step) - 1)]?.id ?? 'details';
  const getNextStep = (step: ProductFormStep) => PRODUCT_FORM_STEPS[Math.min(PRODUCT_FORM_STEPS.length - 1, getStepIndex(step) + 1)]?.id ?? 'photos';
  const isLastStep = (step: ProductFormStep) => step === PRODUCT_FORM_STEPS[PRODUCT_FORM_STEPS.length - 1].id;
  const findCategoryByName = (name: string) => categories.find((category) => category.name.trim().toLowerCase() === name.trim().toLowerCase());
  const isSelectedCategory = (name: string) => Boolean(findCategoryByName(name));
  const validateStep = (fields: ProductFormState, step: ProductFormStep) => {
    if (step === 'details') {
      if (!fields.name.trim() || !fields.categoryName.trim() || !fields.unit.trim()) {
        showAlert({ title: 'Missing details', message: 'Complete product name, category, and unit first.', tone: 'info' });
        return false;
      }
      if (!isSelectedCategory(fields.categoryName)) {
        showAlert({ title: 'Choose a category', message: 'Please select one of your created categories before continuing.', tone: 'info' });
        return false;
      }
    }
    if (step === 'pricing') {
      const cost = Number(fields.cost);
      const price = Number(fields.price);
      if (!Number.isFinite(cost) || !Number.isFinite(price)) {
        showAlert({ title: 'Invalid pricing', message: 'Enter valid cost and price values before continuing.', tone: 'error' });
        return false;
      }
    }
    if (step === 'stock') {
      const stock = Number(fields.stock);
      if (!Number.isFinite(stock)) {
        showAlert({ title: 'Invalid stock', message: 'Enter a valid stock value before continuing.', tone: 'error' });
        return false;
      }
    }
    return true;
  };

  const renderStepTabs = (
    step: ProductFormStep,
    setStep: React.Dispatch<React.SetStateAction<ProductFormStep>>,
    fields: ProductFormState,
  ) => (
    <View style={styles.stepTabs}>
      {PRODUCT_FORM_STEPS.map((item, index) => {
        const active = item.id === step;
        const completed = index < getStepIndex(step);
        return (
          <Pressable
            key={item.id}
            style={[
              styles.stepTab,
              active ? styles.stepTabActive : null,
              {
                backgroundColor: active ? theme.colors.primary : completed ? theme.colors.primary + '14' : theme.colors.surfaceAlt,
                borderColor: active ? theme.colors.primary : theme.colors.border,
              },
            ]}
            onPress={() => {
              if (index > getStepIndex(step) && !validateStep(fields, step)) {
                return;
              }
              animateStepChange(() => setStep(item.id));
            }}
          >
            <Text style={[styles.stepTabText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]}>
              {active ? `${index + 1} ${item.label}` : index + 1}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

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
    activeStep?: ProductFormStep,
  ) => {
    const changeField = (key: keyof ProductFormState, value: string) => setF((prev) => ({ ...prev, [key]: value }));
    const fieldLabel = (label: string, required = false) => (
      <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>
        {label}
        {required ? ' *' : ''}
      </Text>
    );
    const showStep = (step: ProductFormStep) => !activeStep || activeStep === step;
    const variantsVisible = activeStep ? true : variantsOpen;
    const categoryQuery = f.categoryName.trim().toLowerCase();
    const categorySuggestions = categories
      .filter((category) => category.name.trim())
      .filter((category) => !categoryQuery || category.name.toLowerCase().includes(categoryQuery))
      .slice(0, 5);
    const categoryIsValid = isSelectedCategory(f.categoryName);

    return (
      <>
        {showStep('details') ? (
          <>
        {!activeStep ? <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>Details</Text> : null}
        <View style={styles.formSection}>
          {fieldLabel('Product Name', true)}
          <TextInput
            value={f.name}
            onChangeText={(v) => changeField('name', v)}
            placeholder="e.g. Bottled Water 1L"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>

        <View style={styles.formSection}>
          {fieldLabel('Category', true)}
          <TextInput
            value={f.categoryName}
            onChangeText={(v) => changeField('categoryName', v)}
            placeholder="Type category name"
            placeholderTextColor={theme.colors.textMuted}
            style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
          <View style={styles.categorySuggestWrap}>
            {categorySuggestions.map((category) => {
              const active = category.name.trim().toLowerCase() === f.categoryName.trim().toLowerCase();
              return (
                <Pressable
                  key={category.id}
                  style={[
                    styles.categorySuggestChip,
                    {
                      backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                      borderColor: active ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                  onPress={() => changeField('categoryName', category.name)}
                >
                  {(category as any).imageUrl ? (
                    <Image source={{ uri: (category as any).imageUrl }} style={styles.categorySuggestImage} />
                  ) : (
                    <Text style={styles.categorySuggestEmoji}>{getCategoryIcon(category.name, category.icon)}</Text>
                  )}
                  <Text style={[styles.categorySuggestText, { color: active ? theme.colors.primaryContrast : theme.colors.text }]} numberOfLines={1}>
                    {category.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {f.categoryName.trim() && !categoryIsValid ? (
            <Text style={[styles.validationHint, { color: theme.colors.warning }]}>
              Select an existing category to continue.
            </Text>
          ) : null}
        </View>

        <View style={styles.formSection}>
          {fieldLabel('Unit', true)}
          <TextInput value={f.unit} onChangeText={(value) => changeField('unit', value)} placeholder="pcs, kg, box, pack..." placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
        </View>

        <View style={styles.formSection}>
          {fieldLabel('Description')}
          <TextInput
            value={f.description}
            onChangeText={(v) => changeField('description', v)}
            placeholder="Short product description"
            placeholderTextColor={theme.colors.textMuted}
            multiline
            numberOfLines={3}
            style={[styles.input, styles.textarea, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
          />
        </View>

        {/* ─── Pricing ─── */}
          </>
        ) : null}

        {showStep('pricing') ? (
        <View style={styles.formSection}>
          {!activeStep ? <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>Pricing</Text> : null}
          <View style={styles.row}>
            <View style={styles.half}>
              {fieldLabel('Cost *')}
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
              {fieldLabel('Price *')}
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
              {fieldLabel('Sale Price (auto-calculated)')}
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
        </View>
        ) : null}

        {/* ─── Stock ─── */}
        {showStep('stock') ? (
        <View style={styles.formSection}>
          {!activeStep ? <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>Stock</Text> : null}
          <View style={styles.row}>
            <View style={styles.half}>
              {fieldLabel(variantRows.length ? 'Total stock (from variants)' : 'Stock *')}
              <TextInput
                value={variantRows.length ? String(variantRows.reduce((total, variant) => total + Number(variant.stockOverride || 0), 0)) : f.stock}
                onChangeText={(v) => changeField('stock', v)}
                placeholder="0"
                keyboardType="number-pad"
                placeholderTextColor={theme.colors.textMuted}
                editable={!variantRows.length}
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: variantRows.length ? theme.colors.surfaceAlt : theme.colors.surface }]}
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
        </View>

        ) : null}

        {showStep('variants') ? (
        <View style={[styles.variantCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
          {!activeStep ? <Pressable style={styles.variantHeader} onPress={() => setVariantsOpen((prev) => !prev)}>
            <View style={styles.variantHeaderLeft}>
              <Ionicons name="options-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.variantTitle, { color: theme.colors.text }]}>Variants</Text>
              {variantRows.length > 0 ? (
                <View style={[styles.variantCount, { backgroundColor: theme.colors.primary }]}>
                  <Text style={[styles.variantCountText, { color: '#FFF' }]}>{variantRows.length}</Text>
                </View>
              ) : null}
            </View>
            <Ionicons name={variantsOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
          </Pressable> : null}

          {variantsVisible ? (
            <>
              <Text style={[styles.variantHint, { color: theme.colors.textMuted }]}>
                Add options like Color, Size, or Weight. Each variant can have its own image.
              </Text>

              {/* Quick type presets */}
              {/* Draft form — stacked fields */}
              <View style={styles.variantDraftStack}>
                <View style={styles.variantDraftRow}>
                  <View style={styles.variantDraftField}>
                    <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Name</Text>
                    <TextInput
                      value={draft.name}
                      onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
                      placeholder="e.g. Color"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                    />
                  </View>
                  <View style={styles.variantDraftField}>
                    <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Value</Text>
                    <TextInput
                      value={draft.value}
                      onChangeText={(value) => setDraft((prev) => ({ ...prev, value }))}
                      placeholder="e.g. Red"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                    />
                  </View>
                </View>
                <View style={styles.variantDraftRow}>
                  <View style={styles.variantDraftField}>
                    <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Price</Text>
                    <TextInput
                      value={draft.priceDelta}
                      onChangeText={(value) => setDraft((prev) => ({ ...prev, priceDelta: value }))}
                      placeholder="Base price"
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                    />
                  </View>
                  <View style={styles.variantDraftField}>
                    <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Stock</Text>
                    <TextInput
                      value={draft.stockOverride}
                      onChangeText={(value) => setDraft((prev) => ({ ...prev, stockOverride: value }))}
                      placeholder="0"
                      keyboardType="number-pad"
                      placeholderTextColor={theme.colors.textMuted}
                      style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.background }]}
                    />
                  </View>
                </View>
                {/* Variant image upload */}
                <Pressable
                  style={[styles.variantImageBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                  onPress={async () => {
                    const urls = await pickAndUploadImages({
                      bucket: 'product-media',
                      folder: `variants/${draft.name || 'untitled'}`,
                      maxImages: 1,
                    });
                    if (urls.length > 0) setDraft((prev) => ({ ...prev, imageUrl: urls[0] }));
                  }}
                >
                  {draft.imageUrl ? (
                    <Image source={{ uri: draft.imageUrl }} style={styles.variantImagePreview} />
                  ) : (
                    <Ionicons name="image-outline" size={20} color={theme.colors.textMuted} />
                  )}
                  <Text style={[styles.variantImageBtnText, { color: draft.imageUrl ? theme.colors.primary : theme.colors.textMuted }]}>
                    {draft.imageUrl ? 'Change Image' : 'Add Variant Image'}
                  </Text>
                </Pressable>
                <Text style={[styles.uploadHint, { color: theme.colors.textMuted }]}>Use square (1:1) image for best display.</Text>

                <Pressable
                  style={[styles.variantAddBtnFull, { backgroundColor: theme.colors.primary }]}
                  onPress={() => addVariantFromDraft(draft, setDraft, setVariantRows)}
                >
                  <Ionicons name="add-circle-outline" size={16} color="#FFF" />
                  <Text style={[styles.variantAddBtnFullText, { color: '#FFF' }]}>Add Variant</Text>
                </Pressable>
              </View>

              {/* Value preset chips */}
              {/* Added variants — card list */}
              {variantRows.length ? (
                <View style={styles.variantList}>
                  {variantRows.map((variant, index) => (
                    <View key={`${variant.id ?? 'draft'}-${index}`} style={[styles.variantRowCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                      <Pressable style={styles.variantRemoveBtn} onPress={() => setVariantRows((prev) => prev.filter((_, i) => i !== index))}>
                        <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
                      </Pressable>
                      <View style={styles.variantRowTop}>
                        <View style={styles.variantImageColumn}>
                          <Pressable
                            style={[styles.variantRowThumb, { backgroundColor: theme.colors.surfaceAlt }]}
                            onPress={async () => {
                              const urls = await pickAndUploadImages({
                                bucket: 'product-media',
                                folder: `variants/${variant.name || 'untitled'}`,
                                maxImages: 1,
                              });
                              if (urls.length > 0) {
                                setVariantRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, imageUrl: urls[0] } : row));
                              }
                            }}
                          >
                            {variant.imageUrl ? (
                              <Image source={{ uri: variant.imageUrl }} style={styles.variantRowThumbImage} />
                            ) : (
                              <Ionicons name="image-outline" size={15} color={theme.colors.textMuted} />
                            )}
                          </Pressable>
                          <Text style={[styles.variantEditLabel, { color: theme.colors.textMuted }]}>Image</Text>
                        </View>
                        <View style={styles.variantRowInfo}>
                          <View style={styles.variantEditGrid}>
                            <View style={styles.variantEditField}>
                              <Text style={[styles.variantEditLabel, { color: theme.colors.textMuted }]}>Name</Text>
                              <TextInput
                                value={variant.name}
                                onChangeText={(value) => setVariantRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, name: value } : row))}
                                placeholder="e.g. Color"
                                placeholderTextColor={theme.colors.textMuted}
                                style={[styles.variantInlineInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                              />
                            </View>
                            <View style={styles.variantEditField}>
                              <Text style={[styles.variantEditLabel, { color: theme.colors.textMuted }]}>Value</Text>
                              <TextInput
                                value={variant.value}
                                onChangeText={(value) => setVariantRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, value } : row))}
                                placeholder="e.g. Green"
                                placeholderTextColor={theme.colors.textMuted}
                                style={[styles.variantInlineInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                              />
                            </View>
                          </View>
                          <View style={styles.variantEditGrid}>
                            <View style={styles.variantEditField}>
                              <Text style={[styles.variantEditLabel, { color: theme.colors.textMuted }]}>Price</Text>
                              <TextInput
                                value={variant.priceDelta}
                                onChangeText={(value) => setVariantRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, priceDelta: value } : row))}
                                placeholder="Base price"
                                keyboardType="decimal-pad"
                                placeholderTextColor={theme.colors.textMuted}
                                style={[styles.variantInlineInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                              />
                            </View>
                            <View style={styles.variantEditField}>
                              <Text style={[styles.variantEditLabel, { color: theme.colors.textMuted }]}>Stock</Text>
                              <TextInput
                                value={variant.stockOverride}
                                onChangeText={(value) => setVariantRows((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, stockOverride: value } : row))}
                                placeholder="0"
                                keyboardType="number-pad"
                                placeholderTextColor={theme.colors.textMuted}
                                style={[styles.variantInlineInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
                              />
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}
        </View>


        ) : null}
        {showStep('photos') ? (
        <View style={styles.formSection}>
          {!activeStep ? <Text style={[styles.sectionHeading, { color: theme.colors.text }]}>Photos</Text> : null}
          {fieldLabel('Product Images')}
          <Pressable
            style={[styles.uploadBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
            onPress={async () => {
              const urls = await pickAndUploadImages({
                bucket: 'product-media',
                folder: `products/${f.name || 'untitled'}`,
                maxImages: 20 - imgs.length,
                onProgress: setImageUploadProgress,
              });
              setImgs((prev) => [...prev, ...urls].slice(0, 20));
            }}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={theme.colors.textMuted} />
            <Text style={[styles.uploadText, { color: theme.colors.text }]}>
              Upload Images ({imgs.length}/20)
            </Text>
          </Pressable>
          <Text style={[styles.uploadHint, { color: theme.colors.textMuted }]}>
            Use square (1:1) images for best display.
          </Text>
          {imageUploadProgress ? (
            <Text style={[styles.meta, { color: theme.colors.textMuted }]}>
              Uploading {imageUploadProgress.completed}/{imageUploadProgress.total}...
            </Text>
          ) : null}
        </View>
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
      <Pressable
        style={[styles.addProductLauncher, { backgroundColor: theme.colors.primary }]}
        onPress={() => {
          setProductFormStep('details');
          setProductFormExpanded(true);
        }}
      >
        <Ionicons name="add-circle-outline" size={18} color={theme.colors.primaryContrast} />
        <Text style={[styles.addProductLauncherText, { color: theme.colors.primaryContrast }]}>Add Product</Text>
      </Pressable>
      {/* ─── CATEGORIES (horizontal chips) ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card }, theme.shadow.card]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Categories</Text>
        <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>Tap a category to manage.</Text>
        {editCategoryId ? (
          <View style={[styles.catEditFullRow, { backgroundColor: theme.colors.surfaceAlt }]}>
            <Pressable
              onPress={async () => {
                const urls = await pickAndUploadImages({
                  bucket: 'product-media',
                  folder: 'categories',
                  maxImages: 1,
                });
                if (urls.length > 0) setEditCategoryImageUrl(urls[0]);
              }}
              style={[styles.catIconInput, { backgroundColor: theme.colors.background, alignItems: 'center', justifyContent: 'center' }]}
            >
              {editCategoryImageUrl ? (
                <Image source={{ uri: editCategoryImageUrl }} style={{ width: 28, height: 28, borderRadius: 6 }} />
              ) : (
                <Ionicons name="image-outline" size={18} color={theme.colors.textMuted} />
              )}
            </Pressable>
            <TextInput value={editCategoryName} onChangeText={setEditCategoryName} placeholder="Category name"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.catEditInput, { color: theme.colors.text, backgroundColor: theme.colors.background }]} />
            <Pressable onPress={handleUpdateCategory} style={[styles.iconBtnLg, { backgroundColor: theme.colors.primary }]}>
              <Ionicons name="checkmark" size={18} color={theme.colors.primaryContrast} />
            </Pressable>
            <Pressable
              onPress={() => {
                setEditCategoryId(null);
                setEditCategoryName('');
                setEditCategoryImageUrl('');
              }}
              style={[styles.iconBtnLg, { backgroundColor: theme.colors.surface }]}
            >
              <Ionicons name="close" size={18} color={theme.colors.textMuted} />
            </Pressable>
          </View>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catChipRow}>
          {visibleCategories.map((cat) => (
            <Pressable
              key={cat.id}
              style={[styles.catChip, { backgroundColor: theme.colors.surfaceAlt }]}
              onPress={() => { setSelectedCat(cat); setCatActionVisible(true); }}
            >
              {(cat as any).imageUrl ? (
                <Image source={{ uri: (cat as any).imageUrl }} style={styles.catChipImg} />
              ) : (
                <Text style={styles.catEmoji}>{getCategoryIcon(cat.name, cat.icon)}</Text>
              )}
              <Text style={[styles.catChipText, { color: theme.colors.text }]} numberOfLines={1}>{cat.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.addCatRow}>
          <Pressable
            onPress={async () => {
              const urls = await pickAndUploadImages({
                bucket: 'product-media',
                folder: 'categories',
                maxImages: 1,
              });
              if (urls.length > 0) setNewCategoryImageUrl(urls[0]);
            }}
            style={[styles.iconField, { backgroundColor: theme.colors.surface, alignItems: 'center', justifyContent: 'center' }]}
          >
            {newCategoryImageUrl ? (
              <Image source={{ uri: newCategoryImageUrl }} style={{ width: 28, height: 28, borderRadius: 6 }} />
            ) : (
              <Ionicons name="image-outline" size={18} color={theme.colors.textMuted} />
            )}
          </Pressable>
          <View style={styles.flexField}>
            <TextInput value={newCategoryName} onChangeText={setNewCategoryName} placeholder="New category" placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
          </View>
          <Pressable style={[styles.addCatBtn, { backgroundColor: theme.colors.primary }]} onPress={handleAddCategory}>
            <Ionicons name="add" size={18} color={theme.colors.primaryContrast} />
          </Pressable>
        </View>
        <Text style={[styles.uploadHint, { color: theme.colors.textMuted, marginTop: 4 }]}>Use square (1:1) images for category icons.</Text>
      </View>

      {/* ─── PRODUCT LIST ─── */}
      <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Find Product</Text>
        <TextInput
          value={productSearch}
          onChangeText={setProductSearch}
          placeholder="Search by product, SKU, or category..."
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.searchInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface, outlineWidth: 0 }]}
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
                  <View style={styles.prodNameRow}>
                    <Text style={[styles.prodName, { color: theme.colors.text }]} numberOfLines={1}>{product.name}</Text>
                    {product.onSale && product.salePrice !== undefined ? (
                      <View style={[styles.salePill, { backgroundColor: theme.colors.primary }]}>
                        <Text style={[styles.salePillText, { color: '#FFF' }]}>
                          {getDiscountPercentFromPrice(product.price, product.salePrice, product.onSale)}% OFF
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.prodMeta, { color: theme.colors.textMuted }]}>{product.categoryName} · {product.unit}</Text>
                  <View style={styles.prodPriceRow}>
                    <Text style={[styles.prodPrice, { color: theme.colors.primary }]}>{formatPHP(product.onSale && product.salePrice ? product.salePrice : product.price)}</Text>
                    {product.onSale && product.salePrice !== undefined ? (
                      <Text style={[styles.prodOldPrice, { color: theme.colors.textMuted }]}>{formatPHP(product.price)}</Text>
                    ) : null}
                    <Text style={[styles.prodCost, { color: theme.colors.textMuted }]}>cost {formatPHP(product.cost)}</Text>
                  </View>
                </View>
                <View style={styles.prodRight}>
                  <View style={[styles.stockPill, { backgroundColor: isOutOfStock ? theme.colors.dangerBg : isLowStock ? theme.colors.warningBg : theme.colors.successBg }]}>
                    <Text style={[styles.stockPillText, { color: isOutOfStock ? theme.colors.danger : isLowStock ? theme.colors.warning : theme.colors.success }]}>
                      {isOutOfStock ? 'Out of stock' : `${displayStock} stock`}
                    </Text>
                  </View>
                  <View style={styles.prodActions}>
                    <Pressable style={[styles.ghostBtn]} onPress={() => openEditModal(product)}>
                      <Ionicons name="create-outline" size={14} color={theme.colors.textMuted} />
                    </Pressable>
                    <Pressable style={[styles.ghostBtn, { backgroundColor: theme.colors.surfaceAlt }]} onPress={() => openRestockModal(product)}>
                      <Ionicons name="add-circle-outline" size={14} color={theme.colors.success} />
                    </Pressable>
                    <Pressable style={[styles.ghostBtn]} onPress={() => handleDeleteProduct(product)}>
                      <Ionicons name="trash-outline" size={13} color={theme.colors.textMuted} />
                    </Pressable>
                  </View>
                </View>
              </View>
              {hasLowVariantStock ? (
                <View style={styles.variantBadges}>
                  {lowVariantLabels.slice(0, 4).map((label, i) => (
                    <View key={i} style={[styles.variantBadge, { backgroundColor: theme.colors.warningBg }]}>
                      <Text style={[styles.variantBadgeText, { color: theme.colors.warning }]}>{label}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
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
      <Modal visible={productFormExpanded} animationType="slide" transparent>
        <ModalBackdrop overlayOpacity={0.45}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Add Product</Text>
              <Pressable onPress={() => setProductFormExpanded(false)}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.modalStepWrap}>{renderStepTabs(productFormStep, setProductFormStep, form)}</View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ rowGap: 10, paddingBottom: 16 }}>
              <Animated.View style={getStepTransitionStyle(productStepAnim)}>
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
                  productFormStep,
                )}
              </Animated.View>
            </ScrollView>
            <View style={[styles.modalFooter, { borderTopColor: theme.colors.border }]}>
              <Pressable
                style={[styles.outlineBtn, { borderColor: theme.colors.border }]}
                onPress={() => {
                  if (productFormStep === 'details') {
                    resetForm();
                    setProductFormExpanded(false);
                    return;
                  }
                  animateStepChange(() => setProductFormStep(getPreviousStep(productFormStep)));
                }}
              >
                <Text style={[styles.outlineBtnText, { color: theme.colors.text }]}>
                  {productFormStep === 'details' ? 'Cancel' : 'Back'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: saving ? theme.colors.surfaceAlt : theme.colors.primary }]}
                disabled={saving}
                onPress={() => {
                  if (isLastStep(productFormStep)) {
                    submitForm();
                    return;
                  }
                  if (!validateStep(form, productFormStep)) {
                    return;
                  }
                  animateStepChange(() => setProductFormStep(getNextStep(productFormStep)));
                }}
              >
                <Text style={[styles.primaryBtnText, { color: saving ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
                  {saving ? 'Saving...' : isLastStep(productFormStep) ? 'Add Product' : 'Next'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ModalBackdrop>
      </Modal>

      <Modal visible={editModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Edit Product</Text>
              <Pressable onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={22} color={theme.colors.text} />
              </Pressable>
            </View>
            <View style={styles.modalStepWrap}>{renderStepTabs(editFormStep, setEditFormStep, editForm)}</View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ rowGap: 8, paddingBottom: 16 }}>
              <Animated.View style={getStepTransitionStyle(editStepAnim)}>
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
                  editFormStep,
                )}
              </Animated.View>
            </ScrollView>
            <View style={[styles.modalFooter, { borderTopColor: theme.colors.border }]}>
              <Pressable
                style={[styles.outlineBtn, { borderColor: theme.colors.border }]}
                onPress={() => {
                  if (editFormStep === 'details') {
                    setEditModalVisible(false);
                    return;
                  }
                  animateStepChange(() => setEditFormStep(getPreviousStep(editFormStep)));
                }}
              >
                <Text style={[styles.outlineBtnText, { color: theme.colors.text }]}>
                  {editFormStep === 'details' ? 'Cancel' : 'Back'}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: editSaving ? theme.colors.surfaceAlt : theme.colors.primary }]}
                disabled={editSaving}
                onPress={() => {
                  if (isLastStep(editFormStep)) {
                    submitEditForm();
                    return;
                  }
                  if (!validateStep(editForm, editFormStep)) {
                    return;
                  }
                  animateStepChange(() => setEditFormStep(getNextStep(editFormStep)));
                }}
              >
                <Text style={[styles.primaryBtnText, { color: editSaving ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
                  {editSaving ? 'Saving...' : isLastStep(editFormStep) ? 'Save Changes' : 'Next'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ─── RESTOCK MODAL ─── */}
      <Modal visible={restockVisible} animationType="slide" transparent>
        <ModalBackdrop overlayOpacity={0.45}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.card, borderColor: theme.colors.border, maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Restock{restockTarget ? `: ${restockTarget.name}` : ''}</Text>
              <Pressable onPress={() => setRestockVisible(false)}>
                <Ionicons name="close" size={22} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} contentContainerStyle={{ rowGap: 10, paddingBottom: 16 }}>
              {restockTarget ? (
                <>
                  <View style={[styles.restockInfoRow, { backgroundColor: theme.colors.surfaceAlt }]}>
                    <Text style={[styles.restockInfoLabel, { color: theme.colors.textMuted }]}>{hasTrackedVariants(restockTarget) ? 'Current total (variants)' : 'Current stock'}</Text>
                    <Text style={[styles.restockInfoValue, { color: theme.colors.text }]}>{getEffectiveStockForSort(restockTarget)}</Text>
                  </View>

                  {!hasTrackedVariants(restockTarget) ? (
                  <View style={styles.restockSection}>
                    <Text style={[styles.restockSectionTitle, { color: theme.colors.text }]}>Add stock</Text>
                    <View style={styles.restockQtyRow}>
                      <QuantityStepper
                        value={restockBaseQty}
                        min={0}
                        max={9999}
                        onChange={setRestockBaseQty}
                      />
                    </View>
                    <View style={styles.chipWrap}>
                      <Pressable
                        style={[styles.chip, { backgroundColor: theme.colors.surfaceAlt }]}
                        onPress={() => setRestockBaseQty((q) => q + 5)}
                      >
                        <Text style={[styles.chipText, { color: theme.colors.text }]}>+5</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.chip, { backgroundColor: theme.colors.surfaceAlt }]}
                        onPress={() => setRestockBaseQty((q) => q + 10)}
                      >
                        <Text style={[styles.chipText, { color: theme.colors.text }]}>+10</Text>
                      </Pressable>
                      <Pressable style={[styles.chip, { backgroundColor: theme.colors.surfaceAlt }]} onPress={() => setRestockBaseQty((q) => q + 20)}>
                        <Text style={[styles.chipText, { color: theme.colors.text }]}>+20</Text>
                      </Pressable>
                    </View>
                  </View>) : null}

                  {restockTarget.variants && restockTarget.variants.length > 0 ? (
                    <View style={styles.restockSection}>
                      <Text style={[styles.restockSectionTitle, { color: theme.colors.text }]}>Variants</Text>
                      {restockTarget.variants.map((variant) => (
                        <View key={variant.id} style={[styles.restockVariantRow, { borderColor: theme.colors.border }]}>
                          {variant.imageUrl ? (
                            <Image source={{ uri: variant.imageUrl }} style={styles.restockVariantImage} />
                          ) : (
                            <View style={[styles.restockVariantImage, { backgroundColor: theme.colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}>
                              <Ionicons name="image-outline" size={13} color={theme.colors.textMuted} />
                            </View>
                          )}
                          <View style={styles.restockVariantInfo}>
                            <Text style={[styles.restockVariantName, { color: theme.colors.text }]} numberOfLines={1}>{variant.name}: {variant.value}</Text>
                            {variant.stockOverride != null ? (
                              <Text style={[styles.restockVariantCurrent, { color: theme.colors.textMuted }]} numberOfLines={1}>Current: {variant.stockOverride}</Text>
                            ) : null}
                          </View>
                          <View style={styles.restockQtyRow}>
                            <QuantityStepper
                              value={restockVariantQtys[variant.id] ?? 0}
                              min={0}
                              max={9999}
                              onChange={(val) => setRestockVariantQtys((q) => ({ ...q, [variant.id]: val }))}
                              size="small"
                            />
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  <Text style={[styles.restockPreview, { color: theme.colors.textMuted }]}>
                    Current {getEffectiveStockForSort(restockTarget)} → New {getEffectiveStockForSort(restockTarget) + (hasTrackedVariants(restockTarget) ? Object.values(restockVariantQtys).reduce((total, quantity) => total + quantity, 0) : restockBaseQty)}
                  </Text>
                </>
              ) : null}
            </ScrollView>
            <View style={[styles.modalFooter, { borderTopColor: theme.colors.border }]}>
              <Pressable style={[styles.outlineBtn, { borderColor: theme.colors.border }]} onPress={() => setRestockVisible(false)}>
                <Text style={[styles.outlineBtnText, { color: theme.colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryBtn, { backgroundColor: restockSaving ? theme.colors.surfaceAlt : theme.colors.primary }]}
                disabled={restockSaving}
                onPress={submitRestock}
              >
                <Text style={[styles.primaryBtnText, { color: restockSaving ? theme.colors.textMuted : theme.colors.primaryContrast }]}>
                  {restockSaving ? 'Saving...' : 'Confirm Restock'}
                </Text>
              </Pressable>
            </View>
          </View>
        </ModalBackdrop>
      </Modal>

      {/* Category Action Modal */}
      <Modal visible={catActionVisible} transparent animationType="fade" onRequestClose={() => setCatActionVisible(false)}>
        <ModalBackdrop overlayOpacity={0.42} align="center">
          <View style={[styles.catActionModal, { backgroundColor: theme.colors.card }]}>
            <Text style={[styles.catActionTitle, { color: theme.colors.text }]}>{selectedCat?.name}</Text>
            <Pressable
              style={[styles.catActionBtn, { backgroundColor: theme.colors.surfaceAlt }]}
              onPress={() => {
                if (selectedCat) {
                  setEditCategoryId(selectedCat.id);
                  setEditCategoryName(selectedCat.name);
                  setEditCategoryImageUrl((selectedCat as any).imageUrl ?? '');
                }
                setCatActionVisible(false);
              }}
            >
              <Ionicons name="pencil-outline" size={16} color={theme.colors.primary} />
              <Text style={[styles.catActionBtnText, { color: theme.colors.text }]}>Edit Category</Text>
            </Pressable>
            <Pressable
              style={[styles.catActionBtn, { backgroundColor: theme.colors.dangerBg }]}
              onPress={() => {
                if (selectedCat) handleDeleteCategory(selectedCat.id, selectedCat.name);
                setCatActionVisible(false);
              }}
            >
              <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
              <Text style={[styles.catActionBtnText, { color: theme.colors.danger }]}>Delete Category</Text>
            </Pressable>
            <Pressable
              style={[styles.catActionCancel, { backgroundColor: theme.colors.surface }]}
              onPress={() => setCatActionVisible(false)}
            >
              <Text style={[styles.catActionCancelText, { color: theme.colors.textMuted }]}>Cancel</Text>
            </Pressable>
          </View>
        </ModalBackdrop>
      </Modal>

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { gap: 10, padding: 14 },
  card: { borderRadius: 16, padding: 14, rowGap: 8 },
  cardTitle: { fontSize: 15, fontWeight: '600' },
  cardSub: { fontSize: 12, marginTop: 2 },
  addProductLauncher: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 13 },
  addProductLauncherText: { fontSize: 14, fontWeight: '700' },
  collapsibleHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  searchInput: { borderRadius: 12, borderWidth: 1, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  filterRow: { gap: 6, paddingBottom: 2 },
  filterChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  filterChipText: { fontSize: 11, fontWeight: '600' },
  fieldLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  formSection: { gap: 6 },
  sectionHeading: { fontSize: 14, fontWeight: '700', marginTop: 8, paddingBottom: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 10, paddingVertical: 9 },
  categorySuggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  categorySuggestChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, maxWidth: '48%', paddingHorizontal: 10, paddingVertical: 6 },
  categorySuggestEmoji: { fontSize: 12 },
  categorySuggestImage: { borderRadius: 5, height: 16, width: 16 },
  categorySuggestText: { flexShrink: 1, fontSize: 11, fontWeight: '600' },
  validationHint: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  textarea: { minHeight: 72, textAlignVertical: 'top' },
  readonlyField: { justifyContent: 'center' },
  readonlyText: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8 },
  half: { flex: 1, minWidth: 0 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 2 },
  chip: { borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 11, fontWeight: '600' },
  variantCard: { borderRadius: 14, borderWidth: 1, gap: 8, padding: 12 },
  variantHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  variantHeaderLeft: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  variantTitle: { fontSize: 13, fontWeight: '600' },
  variantCount: { borderRadius: 999, height: 18, minWidth: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  variantCountText: { fontSize: 10, fontWeight: '700' },
  variantHint: { fontSize: 11, fontWeight: '500', lineHeight: 16 },
  variantDraftStack: { gap: 6 },
  variantDraftRow: { flexDirection: 'row', gap: 6 },
  variantDraftField: { flex: 1, minWidth: 0 },
  variantImageBtn: { alignItems: 'center', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 12 },
  variantImagePreview: { borderRadius: 6, height: 32, width: 32 },
  variantImageBtnText: { fontSize: 12, fontWeight: '500' },
  variantAddBtnFull: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 4, justifyContent: 'center', paddingVertical: 10 },
  variantAddBtnFullText: { fontSize: 12, fontWeight: '700' },
  variantList: { gap: 6 },
  variantRowCard: { borderRadius: 12, borderWidth: 1, padding: 10, paddingRight: 14, position: 'relative' },
  variantRowTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  variantImageColumn: { alignItems: 'center', gap: 4, width: 48 },
  variantRowThumb: { alignItems: 'center', borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, height: 44, justifyContent: 'center', overflow: 'hidden', width: 44 },
  variantRowThumbImage: { height: '100%', width: '100%' },
  variantRowInfo: { flex: 1, gap: 8, minWidth: 0, paddingRight: 8 },
  variantRowLabel: { fontSize: 12, fontWeight: '600' },
  variantRowMeta: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  variantInlineFields: { flexDirection: 'row', gap: 5, marginTop: 5 },
  variantEditGrid: { flexDirection: 'row', gap: 8 },
  variantEditField: { flex: 1, minWidth: 0 },
  variantEditLabel: { fontSize: 10, fontWeight: '700', marginBottom: 3 },
  variantInlineInput: { borderRadius: 8, borderWidth: 1, fontSize: 11, minHeight: 34, paddingHorizontal: 8, paddingVertical: 7 },
  variantRemoveBtn: { position: 'absolute', right: 8, top: 8, zIndex: 3 },
  primaryBtn: { borderRadius: 12, flex: 1, paddingVertical: 11 },
  primaryBtnText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  outlineBtn: { borderRadius: 12, borderWidth: 1, flex: 1, paddingVertical: 11 },
  outlineBtnText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  uploadBtn: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', paddingVertical: 10 },
  uploadText: { fontSize: 13, fontWeight: '600' },
  uploadHint: { fontSize: 11, fontWeight: '500', marginTop: 4 },
  meta: { fontSize: 12, fontWeight: '500' },
  uploadBtnText: { fontSize: 12, fontWeight: '600' },
  uploadProgressText: { fontSize: 11, fontWeight: '500' },
  imgRow: { gap: 8, paddingVertical: 4 },
  imgWrap: { position: 'relative' },
  imgThumb: { borderRadius: 10, height: 56, width: 56 },
  imgRemove: { position: 'absolute', right: -4, top: -4 },
  helper: { fontSize: 13, fontWeight: '500' },
  catChipRow: { gap: 8, paddingVertical: 4 },
  catChip: { alignItems: 'center', borderRadius: 999, flexDirection: 'row', gap: 4, paddingHorizontal: 10, paddingVertical: 5 },
  catEmoji: { fontSize: 13 },
  catChipImg: { borderRadius: 4, height: 18, width: 18 },
  catChipText: { fontSize: 12, fontWeight: '500' },
  catAction: { padding: 2 },
  catActionModal: { borderRadius: 18, gap: 10, padding: 20, width: 280, alignItems: 'center' },
  catActionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  catActionBtn: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 14, width: '100%' },
  catActionBtnText: { fontSize: 14, fontWeight: '600' },
  catActionCancel: { alignItems: 'center', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, width: '100%' },
  catActionCancelText: { fontSize: 13, fontWeight: '500' },
  catEditFullRow: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 8 },
  catEditInput: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', flex: 1, fontSize: 13, minWidth: 80, paddingHorizontal: 10, paddingVertical: 8 },
  iconBtnLg: { alignItems: 'center', borderRadius: 8, height: 36, justifyContent: 'center', width: 36 },
  addCatRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  iconField: { width: 56 },
  flexField: { flex: 1 },
  catIconInput: { borderRadius: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', fontSize: 16, paddingHorizontal: 10, paddingVertical: 8, width: 56 },
  addCatBtn: { alignItems: 'center', borderRadius: 10, height: 40, justifyContent: 'center', width: 40 },
  list: { gap: 8 },
  prodCard: { borderRadius: 14, gap: 6, padding: 12 },
  prodRow: { flexDirection: 'row', gap: 10 },
  prodThumb: { borderRadius: 10, height: 52, width: 52 },
  prodThumbFallback: { alignItems: 'center', borderRadius: 10, height: 52, justifyContent: 'center', width: 52 },
  prodInfo: { flex: 1, gap: 2, minWidth: 0 },
  prodNameRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  prodName: { flex: 1, fontSize: 13, fontWeight: '600', minWidth: 0 },
  salePill: { borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
  salePillText: { fontSize: 9, fontWeight: '700' },
  prodMeta: { fontSize: 11, fontWeight: '500' },
  prodPriceRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 2 },
  prodPrice: { fontSize: 13, fontWeight: '600' },
  prodOldPrice: { fontSize: 11, fontWeight: '500', textDecorationLine: 'line-through' },
  prodCost: { fontSize: 10, fontWeight: '500' },
  prodRight: { alignItems: 'flex-end', gap: 6, justifyContent: 'space-between' },
  stockPill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  stockPillText: { fontSize: 10, fontWeight: '600' },
  variantBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  variantBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 },
  variantBadgeText: { fontSize: 9, fontWeight: '600' },
  prodActions: { flexDirection: 'row', gap: 4 },
  ghostBtn: { alignItems: 'center', borderRadius: 999, height: 28, justifyContent: 'center', width: 28 },
  paginationRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center', paddingTop: 4, paddingBottom: 8 },
  pageBtn: { borderRadius: 10, borderWidth: 1, minWidth: 96, paddingHorizontal: 14, paddingVertical: 9 },
  pageBtnText: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  pageIndicator: { fontSize: 12, fontWeight: '600' },
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.4)', flex: 1, justifyContent: 'center', padding: 16 },
  modalContent: { borderRadius: 18, maxHeight: '90%', overflow: 'hidden' },
  modalHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  modalStepWrap: { paddingHorizontal: 14, paddingBottom: 8 },
  modalScroll: { paddingHorizontal: 14 },
  modalFooter: { borderTopWidth: 1, flexDirection: 'row', gap: 8, padding: 14 },
  stepLabel: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  stepTabs: { flexDirection: 'row', gap: 8 },
  stepTab: { alignItems: 'center', borderRadius: 999, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  stepTabActive: { minWidth: 92, paddingHorizontal: 12, width: 'auto' },
  stepTabText: { fontSize: 11, fontWeight: '700' },
  restockInfoRow: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  restockInfoLabel: { fontSize: 12, fontWeight: '500' },
  restockInfoValue: { fontSize: 14, fontWeight: '600' },
  restockSection: { gap: 8, marginTop: 4 },
  restockSectionTitle: { fontSize: 13, fontWeight: '600' },
  restockQtyRow: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 5 },
  restockQtyBtn: { alignItems: 'center', borderRadius: 8, height: 34, justifyContent: 'center', width: 34 },
  restockNumberInput: { borderRadius: 8, borderWidth: 1, fontSize: 13, fontWeight: '600', paddingHorizontal: 4, paddingVertical: 7, textAlign: 'center', width: 48 },
  restockQtyDisplay: { alignItems: 'center', borderRadius: 8, borderWidth: 1, minWidth: 48, paddingHorizontal: 8, paddingVertical: 4 },
  restockQtyText: { fontSize: 14, fontWeight: '600' },
  restockVariantRow: { alignItems: 'center', borderBottomWidth: 1, flexDirection: 'row', gap: 8, paddingVertical: 8 },
  restockVariantImage: { borderRadius: 8, height: 34, width: 34 },
  restockVariantInfo: { flex: 1, gap: 2, minWidth: 0 },
  restockVariantName: { fontSize: 12, fontWeight: '600' },
  restockVariantCurrent: { fontSize: 11, fontWeight: '500' },
  restockPreview: { fontSize: 12, fontWeight: '600', marginTop: 4 },
});
