import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ModalBackdrop } from './ModalBackdrop';
import { useTheme } from '../providers/ThemeProvider';
import { Category, ProductSortOption } from '../types/models';
import { getCategoryIcon } from '../utils/categoryIcons';

const SORT_OPTIONS: Array<{ id: ProductSortOption; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'best_selling', label: 'Best Selling' },
    { id: 'name_asc', label: 'A-Z' },
    { id: 'on_sale', label: 'On Sale' },
    { id: 'newest', label: 'Newest First' },
    { id: 'oldest', label: 'Oldest First' },
    { id: 'price_asc', label: 'Price Low to High' },
    { id: 'price_desc', label: 'Price High to Low' },
];

interface FilterModalProps {
    visible: boolean;
    onClose: () => void;
    categories: Category[];
    selectedCategory: string;
    onSelectCategory: (id: string) => void;
    sortBy: ProductSortOption;
    onSelectSort: (sort: ProductSortOption) => void;
}

export function FilterModal({
    visible,
    onClose,
    categories,
    selectedCategory,
    onSelectCategory,
    sortBy,
    onSelectSort,
}: FilterModalProps) {
    const { theme } = useTheme();

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <ModalBackdrop align="flex-end" overlayOpacity={0.32} intensity={35} paddingHorizontal={0}>
                <View style={[styles.sheet, { backgroundColor: theme.colors.card }]}>
                    <View style={styles.handle} />

                    <View style={styles.header}>
                        <Text style={[styles.title, { color: theme.colors.text }]}>Filters</Text>
                        <Pressable onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={22} color={theme.colors.text} />
                        </Pressable>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
                        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted }]}>Category</Text>
                        <View style={styles.chipGrid}>
                            {categories.map((cat) => {
                                const active = cat.id === selectedCategory;
                                return (
                                    <Pressable
                                        key={cat.id}
                                        style={[
                                            styles.chip,
                                            {
                                                backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                                                borderColor: active ? theme.colors.primary : theme.colors.border,
                                            },
                                        ]}
                                        onPress={() => onSelectCategory(cat.id)}
                                    >
                                        <Text style={styles.chipIcon}>{getCategoryIcon(cat.name, cat.icon)}</Text>
                                        <Text
                                            style={[
                                                styles.chipText,
                                                { color: active ? theme.colors.primaryContrast : theme.colors.text },
                                            ]}
                                        >
                                            {cat.name}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <Text style={[styles.sectionTitle, { color: theme.colors.textMuted, marginTop: 18 }]}>
                            Sort By
                        </Text>
                        <View style={styles.chipGrid}>
                            {SORT_OPTIONS.map((option) => {
                                const active = option.id === sortBy;
                                return (
                                    <Pressable
                                        key={option.id}
                                        style={[
                                            styles.chip,
                                            {
                                                backgroundColor: active ? theme.colors.primary : theme.colors.surfaceAlt,
                                                borderColor: active ? theme.colors.primary : theme.colors.border,
                                            },
                                        ]}
                                        onPress={() => onSelectSort(option.id)}
                                    >
                                        <Text
                                            style={[
                                                styles.chipText,
                                                { color: active ? theme.colors.primaryContrast : theme.colors.text },
                                            ]}
                                        >
                                            {option.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </ScrollView>

                    <Pressable
                        style={[styles.applyButton, { backgroundColor: theme.colors.primary }]}
                        onPress={onClose}
                    >
                        <Text style={[styles.applyText, { color: theme.colors.primaryContrast }]}>
                            Apply Filters
                        </Text>
                    </Pressable>
                </View>
            </ModalBackdrop>
        </Modal>
    );
}

const styles = StyleSheet.create({
    sheet: {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
        paddingBottom: 24,
        paddingHorizontal: 18,
        paddingTop: 10,
    },
    handle: {
        alignSelf: 'center',
        backgroundColor: '#64748B',
        borderRadius: 3,
        height: 5,
        marginBottom: 10,
        width: 40,
    },
    header: {
        alignItems: 'center',
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '900',
    },
    closeButton: {
        padding: 4,
    },
    content: {
        paddingBottom: 10,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: '700',
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.6,
    },
    chipGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        alignItems: 'center',
        borderRadius: 999,
        borderWidth: 1,
        flexDirection: 'row',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 9,
    },
    chipIcon: {
        fontSize: 14,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '700',
    },
    applyButton: {
        borderRadius: 999,
        marginTop: 6,
        paddingVertical: 14,
    },
    applyText: {
        fontSize: 15,
        fontWeight: '800',
        textAlign: 'center',
    },
});
