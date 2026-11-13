// Save / unsave with the prototype's toast feedback.

import { useTranslation } from 'react-i18next';
import { useUser } from '@/features/auth/sessionStore';
import { toast } from '@/store/toastStore';
import { useFavoritesStore } from '../store';

export function useIsFavorite(id: string): boolean {
  return useFavoritesStore(s => s.ids.includes(id));
}

export function useToggleFavorite(): (id: string) => void {
  const { t } = useTranslation();
  const toggle = useFavoritesStore(s => s.toggle);
  const user = useUser();
  return id => {
    if (!user) {
      toast.info(t('favorites.signInRequired'));
      return;
    }
    if (toggle(id)) toast.success(t('favorites.saved'));
    else toast.info(t('favorites.removed'));
  };
}
