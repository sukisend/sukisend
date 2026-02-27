import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ModalBackdrop } from './ModalBackdrop';
import { useTheme } from '../providers/ThemeProvider';

interface SearchableDropdownProps {
  label: string;
  placeholder: string;
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  allowCustom?: boolean;
}

function blurActiveWebElement() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }

  const activeElement = document.activeElement as HTMLElement | null;
  activeElement?.blur?.();
}

export function SearchableDropdown({ label, placeholder, value, options, onSelect, allowCustom = false }: SearchableDropdownProps) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const isWeb = Platform.OS === 'web';

  const closeDropdown = () => {
    blurActiveWebElement();
    setOpen(false);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, search]);

  const normalizedSearch = search.trim();
  const showCustomOption =
    allowCustom &&
    normalizedSearch.length > 0 &&
    !options.some((option) => option.toLowerCase() === normalizedSearch.toLowerCase());

  const panelContent = (
    <>
      {!isWeb ? <View style={styles.handle} /> : null}
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.colors.text }]}>Select {label}</Text>
        <Pressable onPress={closeDropdown} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      <View
        style={[
          styles.searchWrap,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`Search ${label.toLowerCase()}...`}
          placeholderTextColor={theme.colors.textMuted}
          style={[styles.searchInput, { color: theme.colors.text }]}
          autoFocus
          onSubmitEditing={() => {
            if (showCustomOption) {
              onSelect(normalizedSearch);
              closeDropdown();
            }
          }}
        />
      </View>

      {showCustomOption ? (
        <Pressable
          style={[styles.customOption, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
          onPress={() => {
            onSelect(normalizedSearch);
            closeDropdown();
          }}
        >
          <Text style={[styles.customOptionText, { color: theme.colors.primary }]}>Use "{normalizedSearch}"</Text>
        </Pressable>
      ) : null}

      <FlatList
        data={filtered}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.list}
        renderItem={({ item }) => {
          const active = item === value;
          return (
            <Pressable
              style={[
                styles.option,
                {
                  backgroundColor: active ? theme.colors.surfaceAlt : 'transparent',
                },
              ]}
              onPress={() => {
                onSelect(item);
                closeDropdown();
              }}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: active ? theme.colors.primary : theme.colors.text },
                ]}
              >
                {item}
              </Text>
              {active ? <Ionicons name="checkmark-circle" size={18} color={theme.colors.primary} /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: theme.colors.textMuted }]}>No results found</Text>
        }
      />
    </>
  );

  return (
    <>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Pressable
        style={[
          styles.trigger,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
          },
        ]}
        onPress={() => {
          setSearch(value);
          setOpen(true);
        }}
      >
        <Text
          style={[
            styles.triggerText,
            { color: value ? theme.colors.text : theme.colors.textMuted },
          ]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.colors.textMuted} />
      </Pressable>

      {isWeb ? (
        open ? (
          <View style={[styles.webPanel, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>{panelContent}</View>
        ) : null
      ) : (
        <Modal visible={open} transparent animationType="slide" onRequestClose={closeDropdown}>
          <ModalBackdrop align="flex-end" overlayOpacity={0.32} intensity={32} paddingHorizontal={0}>
            <View style={[styles.sheet, { backgroundColor: theme.colors.card }]}>{panelContent}</View>
          </ModalBackdrop>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  trigger: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    paddingBottom: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  webPanel: {
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 8,
    maxHeight: 320,
    paddingHorizontal: 12,
    paddingVertical: 10,
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
    marginBottom: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: '900',
  },
  closeBtn: {
    padding: 4,
  },
  searchWrap: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  customOption: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customOptionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  option: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    paddingVertical: 20,
    textAlign: 'center',
  },
});




