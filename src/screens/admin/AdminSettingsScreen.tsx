import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { BrandAlertModal } from '../../components/BrandAlertModal';
import { SectionHeader } from '../../components/SectionHeader';
import { useBrandAlert } from '../../hooks/useBrandAlert';
import { useTheme } from '../../providers/ThemeProvider';
import {
  fetchBanners,
  saveBanner,
  deleteBanner,
  reorderBanners,
  fetchCouponsAdmin,
  saveCoupon,
  deleteCoupon,
  Banner,
  CouponRecord,
} from '../../services/adminService';
import { pickAndUploadImages } from '../../services/mediaService';
import {
  fetchStoreLocation,
  saveStoreLocation,
  fetchDeliveryRadiusMeters,
  saveDeliveryRadiusMeters,
  fetchDeliveryRatePerKmSetting,
  saveDeliveryRatePerKmSetting,
  fetchFreeShippingThreshold,
  saveFreeShippingThreshold,
} from '../../services/settingsService';
import { formatPHP } from '../../utils/currency';

const EMPTY_BANNER = { title: '', subtitle: '', imageUrl: '' };
const EMPTY_COUPON = { code: '', description: '', discountType: 'percent' as 'percent' | 'fixed', discountValue: '', minOrder: '', maxDiscount: '', usageLimit: '', startsAt: '', expiresAt: '' };

export function AdminSettingsScreen() {
  const { theme } = useTheme();
  const { alertConfig, showAlert, hideAlert, confirmAlert } = useBrandAlert();

  const [activeSection, setActiveSection] = useState<'banners' | 'coupons' | 'store'>('banners');

  // ─── Banners ───
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loadingBanners, setLoadingBanners] = useState(false);
  const [bannerForm, setBannerForm] = useState(EMPTY_BANNER);
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null);
  const [savingBanner, setSavingBanner] = useState(false);

  // ─── Coupons ───
  const [coupons, setCoupons] = useState<CouponRecord[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponForm, setCouponForm] = useState(EMPTY_COUPON);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [couponModalVisible, setCouponModalVisible] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);

  // ─── Store Settings ───
  const [storeLat, setStoreLat] = useState('');
  const [storeLng, setStoreLng] = useState('');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('');
  const [ratePerKm, setRatePerKm] = useState('');
  const [freeShippingThreshold, setFreeShippingThreshold] = useState('');
  const [loadingStore, setLoadingStore] = useState(false);
  const [savingStore, setSavingStore] = useState(false);

  const loadBanners = async () => {
    setLoadingBanners(true);
    try {
      setBanners(await fetchBanners());
    } catch { setBanners([]); }
    setLoadingBanners(false);
  };

  const loadCoupons = async () => {
    setLoadingCoupons(true);
    try {
      setCoupons(await fetchCouponsAdmin());
    } catch { setCoupons([]); }
    setLoadingCoupons(false);
  };

  const loadStore = async () => {
    setLoadingStore(true);
    try {
      const [loc, radius, rate, freeShipThreshold] = await Promise.all([
        fetchStoreLocation(),
        fetchDeliveryRadiusMeters(),
        fetchDeliveryRatePerKmSetting(),
        fetchFreeShippingThreshold(),
      ]);
      setStoreLat(String(loc.latitude));
      setStoreLng(String(loc.longitude));
      setDeliveryRadiusKm(String((radius / 1000).toFixed(1)));
      setRatePerKm(String(rate));
      setFreeShippingThreshold(freeShipThreshold > 0 ? String(freeShipThreshold) : '');
    } catch { /* keep defaults */ }
    setLoadingStore(false);
  };

  useEffect(() => { loadBanners(); loadCoupons(); loadStore(); }, []);

  // ─── Banner handlers ───
  const handleSaveBanner = async () => {
    if (!bannerForm.imageUrl || !bannerForm.title.trim()) {
      showAlert({ title: 'Missing fields', message: 'Image and title are required.', tone: 'info' });
      return;
    }
    setSavingBanner(true);
    try {
      await saveBanner({
        id: editingBannerId ?? undefined,
        image_url: bannerForm.imageUrl,
        title: bannerForm.title.trim(),
        subtitle: bannerForm.subtitle.trim() || undefined,
        is_active: true,
      });
      setBannerForm(EMPTY_BANNER);
      setEditingBannerId(null);
      await loadBanners();
      showAlert({ title: 'Banner saved', message: 'Banner updated successfully.', tone: 'success' });
    } catch (e) {
      showAlert({ title: 'Save failed', message: e instanceof Error ? e.message : 'Unknown error', tone: 'error' });
    }
    setSavingBanner(false);
  };

  const handleDeleteBanner = (id: string) => {
    showAlert({
      title: 'Delete banner?',
      message: 'This action cannot be undone.',
      tone: 'error',
      actionLabel: 'Delete',
      onAction: async () => {
        await deleteBanner(id);
        await loadBanners();
      },
      cancelLabel: 'Cancel',
    });
  };

  const handleReorderBanner = async (bannerId: string, direction: 'up' | 'down') => {
    const idx = banners.findIndex((b) => b.id === bannerId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= banners.length) return;
    const updated = [...banners];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    setBanners(updated);
    try {
      await reorderBanners(updated.map((b) => b.id));
    } catch {
      await loadBanners();
    }
  };

  // ─── Coupon handlers ───
  const generateCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    setCouponForm((prev) => ({ ...prev, code }));
  };

  const resetCouponForm = () => {
    setCouponForm(EMPTY_COUPON);
    setEditingCouponId(null);
  };

  const handleSaveCoupon = async () => {
    if (!couponForm.code.trim() || !couponForm.discountValue.trim()) {
      showAlert({ title: 'Missing fields', message: 'Code and discount value are required.', tone: 'info' });
      return;
    }
    setSavingCoupon(true);
    try {
      await saveCoupon({
        id: editingCouponId ?? undefined,
        code: couponForm.code,
        description: couponForm.description,
        discountType: couponForm.discountType,
        discountValue: Number(couponForm.discountValue),
        minOrder: couponForm.minOrder ? Number(couponForm.minOrder) : 0,
        maxDiscount: couponForm.maxDiscount ? Number(couponForm.maxDiscount) : undefined,
        usageLimit: couponForm.usageLimit ? Number(couponForm.usageLimit) : undefined,
        isActive: true,
        startsAt: couponForm.startsAt || undefined,
        expiresAt: couponForm.expiresAt || undefined,
      });
      setCouponForm(EMPTY_COUPON);
      setEditingCouponId(null);
      setCouponModalVisible(false);
      await loadCoupons();
      showAlert({ title: 'Coupon saved', message: 'Coupon updated successfully.', tone: 'success' });
    } catch (e) {
      showAlert({ title: 'Save failed', message: e instanceof Error ? e.message : 'Unknown error', tone: 'error' });
    }
    setSavingCoupon(false);
  };

  const handleDeleteCoupon = (id: string) => {
    showAlert({
      title: 'Delete coupon?',
      message: 'This action cannot be undone.',
      tone: 'error',
      actionLabel: 'Delete',
      onAction: async () => {
        await deleteCoupon(id);
        await loadCoupons();
      },
      cancelLabel: 'Cancel',
    });
  };

  const handleSaveStore = async () => {
    const lat = Number(storeLat);
    const lng = Number(storeLng);
    const radius = Number(deliveryRadiusKm);
    const rate = Number(ratePerKm);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      showAlert({ title: 'Invalid coordinates', message: 'Enter valid latitude and longitude.', tone: 'info' });
      return;
    }
    setSavingStore(true);
    try {
      const threshold = Number(freeShippingThreshold);
      await Promise.all([
        saveStoreLocation(lat, lng),
        radius > 0 ? saveDeliveryRadiusMeters(radius * 1000) : Promise.resolve(),
        rate > 0 ? saveDeliveryRatePerKmSetting(rate) : Promise.resolve(),
        saveFreeShippingThreshold(Number.isFinite(threshold) && threshold > 0 ? threshold : 0),
      ]);
      showAlert({ title: 'Store settings saved', message: 'All settings updated.', tone: 'success' });
    } catch (e) {
      showAlert({ title: 'Save failed', message: e instanceof Error ? e.message : 'Unknown error', tone: 'error' });
    }
    setSavingStore(false);
  };

  const sections = [
    { key: 'banners' as const, label: 'Banners', icon: 'images-outline' },
    { key: 'coupons' as const, label: 'Coupons', icon: 'pricetag-outline' },
    { key: 'store' as const, label: 'Store', icon: 'storefront-outline' },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SectionHeader title="Settings" subtitle="Manage banners, coupons, and store configuration." />

      {/* Section tabs */}
      <View style={styles.tabRow}>
        {sections.map((s) => {
          const active = activeSection === s.key;
          return (
            <Pressable
              key={s.key}
              style={[styles.tab, { backgroundColor: active ? theme.colors.primary : theme.colors.surface, borderColor: active ? theme.colors.primary : theme.colors.border }]}
              onPress={() => setActiveSection(s.key)}
            >
              <Ionicons name={s.icon as any} size={14} color={active ? '#fff' : theme.colors.textMuted} />
              <Text style={[styles.tabText, { color: active ? '#fff' : theme.colors.text }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ─── BANNERS ─── */}
      {activeSection === 'banners' && (
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Banner Management</Text>

          {/* Banner form */}
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: theme.colors.textMuted }]}>Title *</Text>
            <TextInput
              value={bannerForm.title}
              onChangeText={(v) => setBannerForm((p) => ({ ...p, title: v }))}
              placeholder="Banner title"
              placeholderTextColor={theme.colors.textMuted}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
            />
            <Pressable
              style={[styles.imageUploadBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
              onPress={async () => {
                const urls = await pickAndUploadImages({ bucket: 'banner-media', folder: 'banners', maxImages: 1 });
                if (urls.length > 0) setBannerForm((p) => ({ ...p, imageUrl: urls[0] }));
              }}
            >
              {bannerForm.imageUrl ? (
                <Image source={{ uri: bannerForm.imageUrl }} style={styles.bannerPreview} />
              ) : (
                <Ionicons name="image-outline" size={24} color={theme.colors.textMuted} />
              )}
              <Text style={[styles.imageUploadText, { color: bannerForm.imageUrl ? theme.colors.primary : theme.colors.textMuted }]}>
                {bannerForm.imageUrl ? 'Change Image' : 'Upload Banner Image'}
              </Text>
            </Pressable>
            <Text style={[styles.hint, { color: theme.colors.textMuted }]}>Use 16:9 landscape images for best display.</Text>

            <Pressable
              style={[styles.primaryBtn, { backgroundColor: savingBanner ? theme.colors.surfaceAlt : theme.colors.primary }]}
              disabled={savingBanner}
              onPress={handleSaveBanner}
            >
              <Text style={[styles.primaryBtnText, { color: savingBanner ? theme.colors.textMuted : '#fff' }]}>
                {savingBanner ? 'Saving...' : editingBannerId ? 'Update Banner' : 'Add Banner'}
              </Text>
            </Pressable>
          </View>

          {/* Banner list */}
          {loadingBanners ? <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 12 }} /> : null}
          {banners.map((banner, index) => (
            <View key={banner.id} style={[styles.listItem, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              {banner.image_url ? <Image source={{ uri: banner.image_url }} style={styles.listThumb} /> : null}
              <View style={styles.listItemInfo}>
                <Text style={[styles.listItemTitle, { color: theme.colors.text }]} numberOfLines={1}>{banner.title}</Text>
              </View>
              <View style={styles.listItemActions}>
                <Pressable disabled={index === 0} onPress={() => handleReorderBanner(banner.id, 'up')}>
                  <Ionicons name="chevron-up" size={16} color={index === 0 ? theme.colors.border : theme.colors.textMuted} />
                </Pressable>
                <Pressable disabled={index === banners.length - 1} onPress={() => handleReorderBanner(banner.id, 'down')}>
                  <Ionicons name="chevron-down" size={16} color={index === banners.length - 1 ? theme.colors.border : theme.colors.textMuted} />
                </Pressable>
                <Pressable onPress={() => {
                  setEditingBannerId(banner.id);
                  setBannerForm({ title: banner.title ?? '', subtitle: banner.subtitle ?? '', imageUrl: banner.image_url });
                }}>
                  <Ionicons name="pencil" size={16} color={theme.colors.primary} />
                </Pressable>
                <Pressable onPress={() => handleDeleteBanner(banner.id)}>
                  <Ionicons name="trash-outline" size={16} color={theme.colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ─── COUPONS ─── */}
      {activeSection === 'coupons' && (
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Coupons</Text>
              <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>Create and manage discount codes for customers.</Text>
            </View>
            <Pressable
              style={[styles.couponSubmitBtn, { backgroundColor: theme.colors.primary, paddingHorizontal: 14 }]}
              onPress={() => { editingCouponId && resetCouponForm(); setCouponModalVisible(true); }}
            >
              <Ionicons name="add-circle-outline" size={15} color="#fff" />
              <Text style={[styles.couponSubmitBtnText, { color: '#fff' }]}>New</Text>
            </Pressable>
          </View>

          {/* ── Coupon List ── */}
          <Text style={[styles.couponListTitle, { color: theme.colors.text }]}>Active Coupons ({coupons.length})</Text>

          {loadingCoupons ? <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginTop: 12 }} /> : null}
          {!loadingCoupons && coupons.length === 0 ? (
            <Text style={[styles.couponEmpty, { color: theme.colors.textMuted }]}>No coupons created yet.</Text>
          ) : null}
          {coupons.map((coupon) => {
            const usagePercent = coupon.usageLimit ? Math.min(100, (coupon.usedCount / coupon.usageLimit) * 100) : 0;
            return (
              <View key={coupon.id} style={[styles.couponCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                <View style={styles.couponCardRow}>
                  <View style={styles.couponCardLeft}>
                    <View style={styles.couponCodeRow}>
                      <Text style={[styles.couponCodeText, { color: theme.colors.primary }]}>{coupon.code}</Text>
                      <Pressable
                        style={[styles.couponCopyBtn, { backgroundColor: theme.colors.primary + '12' }]}
                        hitSlop={8}
                        onPress={async () => {
                          await Clipboard.setStringAsync(coupon.code);
                          Alert.alert('Copied!', `"${coupon.code}" copied to clipboard.`);
                        }}
                      >
                        <Ionicons name="copy-outline" size={12} color={theme.colors.primary} />
                      </Pressable>
                      {!coupon.isActive ? (
                        <View style={[styles.inactiveTag, { backgroundColor: theme.colors.danger + '18' }]}>
                          <Text style={[styles.inactiveTagText, { color: theme.colors.danger }]}>INACTIVE</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.couponDesc, { color: theme.colors.textMuted }]} numberOfLines={1}>
                      {coupon.discountType === 'percent' ? `${coupon.discountValue}% off` : `${formatPHP(coupon.discountValue)} off`}
                      {coupon.minOrder > 0 ? ` • Min ${formatPHP(coupon.minOrder)}` : ''}
                      {coupon.usageLimit ? ` • ${coupon.usedCount}/${coupon.usageLimit} used` : ` • ${coupon.usedCount} used`}
                    </Text>
                  </View>
                  <View style={styles.couponCardActions}>
                    <Pressable
                      style={[styles.couponActionBtn, { backgroundColor: theme.colors.primary + '15' }]}
                      onPress={() => {
                        setEditingCouponId(coupon.id);
                        setCouponForm({
                          code: coupon.code,
                          description: coupon.description,
                          discountType: coupon.discountType,
                          discountValue: String(coupon.discountValue),
                          minOrder: coupon.minOrder > 0 ? String(coupon.minOrder) : '',
                          maxDiscount: coupon.maxDiscount !== undefined ? String(coupon.maxDiscount) : '',
                          usageLimit: coupon.usageLimit !== undefined ? String(coupon.usageLimit) : '',
                          startsAt: coupon.startsAt ?? '',
                          expiresAt: coupon.expiresAt ?? '',
                        });
                        setCouponModalVisible(true);
                      }}
                    >
                      <Ionicons name="pencil" size={14} color={theme.colors.primary} />
                    </Pressable>
                    <Pressable
                      style={[styles.couponActionBtn, { backgroundColor: theme.colors.danger + '15' }]}
                      onPress={() => handleDeleteCoupon(coupon.id)}
                    >
                      <Ionicons name="trash-outline" size={14} color={theme.colors.danger} />
                    </Pressable>
                  </View>
                </View>

                {coupon.usageLimit ? (
                  <View style={styles.usageBarRow}>
                    <View style={[styles.usageBarTrack, { backgroundColor: theme.colors.border }]}>
                      <View style={[styles.usageBarFill, { width: `${usagePercent}%`, backgroundColor: usagePercent >= 90 ? theme.colors.danger : theme.colors.primary }]} />
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      {/* ─── STORE SETTINGS ─── */}
      {activeSection === 'store' && (
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Store & Shipping Settings</Text>
          <Text style={[styles.cardSub, { color: theme.colors.textMuted }]}>Configure store location, delivery radius, and shipping rate.</Text>

          {loadingStore ? <ActivityIndicator size="small" color={theme.colors.primary} /> : (
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Store Latitude</Text>
              <TextInput
                value={storeLat}
                onChangeText={setStoreLat}
                placeholder="e.g. 13.2186"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Store Longitude</Text>
              <TextInput
                value={storeLng}
                onChangeText={setStoreLng}
                placeholder="e.g. 120.6033"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Delivery Radius (km)</Text>
              <TextInput
                value={deliveryRadiusKm}
                onChangeText={setDeliveryRadiusKm}
                placeholder="e.g. 15"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Delivery Rate per km (₱)</Text>
              <TextInput
                value={ratePerKm}
                onChangeText={setRatePerKm}
                placeholder="e.g. 20"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />
              <Text style={[styles.label, { color: theme.colors.textMuted }]}>Free Shipping Min Order (₱)</Text>
              <TextInput
                value={freeShippingThreshold}
                onChangeText={setFreeShippingThreshold}
                placeholder="e.g. 500 (0 = disabled)"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]}
              />

              <Pressable
                style={[styles.primaryBtn, { backgroundColor: savingStore ? theme.colors.surfaceAlt : theme.colors.primary }]}
                disabled={savingStore}
                onPress={handleSaveStore}
              >
                <Text style={[styles.primaryBtnText, { color: savingStore ? theme.colors.textMuted : '#fff' }]}>
                  {savingStore ? 'Saving...' : 'Save Store Settings'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      <BrandAlertModal config={alertConfig} onClose={hideAlert} onConfirm={confirmAlert} />

      {/* Coupon Edit/Create Modal */}
      <Modal visible={couponModalVisible} transparent animationType="fade" onRequestClose={() => { resetCouponForm(); setCouponModalVisible(false); }}>
        <View style={{ backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'center', paddingHorizontal: 16 }}>
          <View style={{ backgroundColor: theme.colors.card, borderRadius: 16, maxHeight: '85%', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.text }}>{editingCouponId ? 'Edit Coupon' : 'New Coupon'}</Text>
              <Pressable onPress={() => { resetCouponForm(); setCouponModalVisible(false); }} hitSlop={8}>
                <Ionicons name="close" size={20} color={theme.colors.textMuted} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Coupon Code *</Text>
                <View style={styles.codeGenerateRow}>
                  <TextInput value={couponForm.code} onChangeText={(v) => setCouponForm((p) => ({ ...p, code: v }))} placeholder="e.g. SUMMER20" placeholderTextColor={theme.colors.textMuted} autoCapitalize="none" style={[styles.codeInput, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
                  <Pressable style={[styles.genCodeBtn, { backgroundColor: theme.colors.primary + '18', borderColor: theme.colors.primary + '40' }]} onPress={generateCode}>
                    <Ionicons name="refresh" size={13} color={theme.colors.primary} />
                    <Text style={[styles.genCodeBtnText, { color: theme.colors.primary }]}>Generate</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Description</Text>
                <TextInput value={couponForm.description} onChangeText={(v) => setCouponForm((p) => ({ ...p, description: v }))} placeholder="Optional — e.g. Holiday promo" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Discount Type</Text>
                <View style={[styles.segmentedRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                  <Pressable style={[styles.segmentBtn, couponForm.discountType === 'percent' && { backgroundColor: theme.colors.primary }]} onPress={() => setCouponForm((p) => ({ ...p, discountType: 'percent' }))}>
                    <Text style={[styles.segmentText, { color: couponForm.discountType === 'percent' ? '#fff' : theme.colors.textMuted }]}>Percent (%)</Text>
                  </Pressable>
                  <Pressable style={[styles.segmentBtn, couponForm.discountType === 'fixed' && { backgroundColor: theme.colors.primary }]} onPress={() => setCouponForm((p) => ({ ...p, discountType: 'fixed' }))}>
                    <Text style={[styles.segmentText, { color: couponForm.discountType === 'fixed' ? '#fff' : theme.colors.textMuted }]}>Fixed (₱)</Text>
                  </Pressable>
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Discount Value *</Text>
                <TextInput value={couponForm.discountValue} onChangeText={(v) => setCouponForm((p) => ({ ...p, discountValue: v }))} placeholder={couponForm.discountType === 'percent' ? 'e.g. 10' : 'e.g. 50'} keyboardType="decimal-pad" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
              </View>
              <View style={styles.halfRow}>
                <View style={styles.halfField}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Min Order</Text>
                  <TextInput value={couponForm.minOrder} onChangeText={(v) => setCouponForm((p) => ({ ...p, minOrder: v }))} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
                </View>
                <View style={styles.halfField}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Max Discount</Text>
                  <TextInput value={couponForm.maxDiscount} onChangeText={(v) => setCouponForm((p) => ({ ...p, maxDiscount: v }))} placeholder="Optional" keyboardType="decimal-pad" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={[styles.fieldLabel, { color: theme.colors.textMuted }]}>Usage Limit</Text>
                <TextInput value={couponForm.usageLimit} onChangeText={(v) => setCouponForm((p) => ({ ...p, usageLimit: v }))} placeholder="Unlimited" keyboardType="number-pad" placeholderTextColor={theme.colors.textMuted} style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text, backgroundColor: theme.colors.surface }]} />
              </View>
              <Pressable style={[styles.couponSubmitBtn, { backgroundColor: savingCoupon ? theme.colors.surfaceAlt : theme.colors.primary }]} disabled={savingCoupon} onPress={handleSaveCoupon}>
                <Ionicons name={editingCouponId ? 'checkmark-circle-outline' : 'add-circle-outline'} size={16} color={savingCoupon ? theme.colors.textMuted : '#fff'} />
                <Text style={[styles.couponSubmitBtnText, { color: savingCoupon ? theme.colors.textMuted : '#fff' }]}>
                  {savingCoupon ? 'Saving...' : editingCouponId ? 'Update Coupon' : 'Create Coupon'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 12, marginTop: 12 },
  tab: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingVertical: 8 },
  tabText: { fontSize: 12, fontWeight: '600' },
  card: { borderRadius: 14, borderWidth: 1, gap: 12, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardSub: { fontSize: 11, fontWeight: '500', lineHeight: 16 },
  formGroup: { gap: 6, marginTop: 4 },
  label: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  input: { borderRadius: 10, borderWidth: 1, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  codeRow: { flexDirection: 'row', gap: 8 },
  typeRow: { flexDirection: 'row', gap: 6 },
  typeBtn: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', height: 38, justifyContent: 'center', paddingHorizontal: 10, gap: 2 },
  genCodeBtn: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 5, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  genCodeBtnText: { fontSize: 12, fontWeight: '700' },
  imageUploadBtn: { alignItems: 'center', borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', flexDirection: 'row', gap: 8, paddingVertical: 12, paddingHorizontal: 12 },
  imageUploadText: { fontSize: 12, fontWeight: '500' },
  bannerPreview: { borderRadius: 6, height: 48, width: 80 },
  hint: { fontSize: 10, fontWeight: '500' },
  primaryBtn: { alignItems: 'center', borderRadius: 10, marginTop: 4, paddingVertical: 12 },
  primaryBtnText: { fontSize: 13, fontWeight: '700' },
  listItem: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 8, padding: 10 },
  listThumb: { borderRadius: 6, height: 44, width: 44 },
  listItemInfo: { flex: 1, minWidth: 0 },
  listItemTitle: { fontSize: 12, fontWeight: '600' },
  listItemSub: { fontSize: 10, fontWeight: '500', marginTop: 2 },
  listItemActions: { flexDirection: 'row', gap: 10 },

  // ─── Coupon Redesign ───
  fieldGroup: { gap: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '600' },
  codeGenerateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codeInput: { borderRadius: 10, borderWidth: 1, flex: 1, fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
  segmentedRow: { borderRadius: 10, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  segmentBtn: { alignItems: 'center', borderRadius: 8, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', margin: 3, paddingVertical: 9 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  halfRow: { flexDirection: 'row', gap: 10 },
  halfField: { flex: 1, gap: 4 },
  couponSubmitBtn: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 4, paddingVertical: 13 },
  couponSubmitBtnText: { fontSize: 13, fontWeight: '700' },
  divider: { height: 1, marginVertical: 2 },
  couponListTitle: { fontSize: 13, fontWeight: '700' },
  couponEmpty: { fontSize: 12, fontWeight: '500', textAlign: 'center', paddingVertical: 16 },
  couponCard: { borderRadius: 12, borderWidth: 1, gap: 8, marginTop: 8, padding: 14 },
  couponCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  couponCardLeft: { flex: 1, gap: 4 },
  couponCodeRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  couponCodeText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  couponCopyBtn: {
    alignItems: 'center',
    borderRadius: 6,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  inactiveTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  inactiveTagText: { fontSize: 9, fontWeight: '700' },
  couponCardActions: { flexDirection: 'row', gap: 6 },
  couponActionBtn: { alignItems: 'center', borderRadius: 8, height: 30, justifyContent: 'center', width: 30 },
  couponDesc: { fontSize: 12, fontWeight: '500' },
  usageBarRow: { marginTop: 2 },
  usageBarTrack: { borderRadius: 3, height: 5, overflow: 'hidden' },
  usageBarFill: { borderRadius: 3, height: 5 },
});
