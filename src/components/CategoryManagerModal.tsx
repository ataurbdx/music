import React, { useState } from 'react';
import { CategoryRecord, SongRecord } from '../types';
import { songRepository } from '../data/songRepository';
import { motion } from 'motion/react';
import { Tags, Plus, Edit2, Trash2, X, Check, AlertCircle } from 'lucide-react';

interface CategoryManagerModalProps {
  categories: CategoryRecord[];
  allSongs: SongRecord[];
  onClose: () => void;
  onCategoriesUpdated: () => void;
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  categories,
  allSongs,
  onClose,
  onCategoriesUpdated,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deletingCat, setDeletingCat] = useState<CategoryRecord | null>(null);
  const [replacementCatId, setReplacementCatId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState('');

  const getSongCountForCategory = (catId: string) => {
    return allSongs.filter((s) => s.categoryId === catId).length;
  };

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    setErrorMsg('');
    try {
      await songRepository.addCategory(newCatName.trim());
      setNewCatName('');
      onCategoriesUpdated();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to add category');
    }
  };

  const handleStartEdit = (cat: CategoryRecord) => {
    setEditingCatId(cat.id);
    setEditingName(cat.name);
  };

  const handleSaveEdit = async () => {
    if (!editingCatId || !editingName.trim()) return;
    try {
      await songRepository.updateCategory(editingCatId, { name: editingName.trim() });
      setEditingCatId(null);
      setEditingName('');
      onCategoriesUpdated();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to rename category');
    }
  };

  const handleInitiateDelete = (cat: CategoryRecord) => {
    const songCount = getSongCountForCategory(cat.id);
    if (songCount > 0) {
      const otherCats = categories.filter((c) => c.id !== cat.id);
      setReplacementCatId(otherCats[0]?.id || '');
      setDeletingCat(cat);
    } else {
      if (window.confirm(`Delete empty category "${cat.name}"?`)) {
        songRepository.deleteCategory(cat.id).then(() => onCategoriesUpdated());
      }
    }
  };

  const handleConfirmReassignDelete = async () => {
    if (!deletingCat || !replacementCatId) return;
    try {
      await songRepository.deleteCategory(deletingCat.id, replacementCatId);
      setDeletingCat(null);
      onCategoriesUpdated();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to delete category');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end animate-in fade-in duration-200">
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="w-full max-w-[440px] mx-auto rounded-t-[36px] bg-ambient-cosmic border-t border-white/15 max-h-[85vh] flex flex-col shadow-[0_-15px_45px_rgba(0,0,0,0.85)] overflow-hidden"
      >
        {/* Grab handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-white/10 dark:border-white/10 light:border-slate-200/80 frosted-surface">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Tags className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white dark:text-white light:text-slate-900 leading-tight">Categories</h2>
              <p className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-500">Organize song collections</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full frosted-surface border border-white/10 dark:border-white/10 light:border-slate-200 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-90"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 overscroll-contain">
          {errorMsg && (
            <div className="p-3.5 rounded-[20px] bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Add Category Input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="New category name (e.g. Gazal, Adda)..."
              className="flex-1 px-4 py-3 rounded-full frosted-surface border border-white/10 dark:border-white/10 light:border-slate-200 text-xs text-white dark:text-white light:text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-500/50"
            />
            <button
              onClick={handleAddCategory}
              disabled={!newCatName.trim()}
              className="btn-primary-gradient w-12 h-12 rounded-full flex items-center justify-center text-white disabled:opacity-40 active:scale-90 shrink-0 shadow-md"
            >
              <Plus className="w-5 h-5 stroke-[3]" />
            </button>
          </div>

          {/* Categories List */}
          <div className="space-y-2 rounded-[24px] border border-white/10 dark:border-white/10 light:border-slate-200 p-2 frosted-card">
            {categories.map((cat) => {
              const count = getSongCountForCategory(cat.id);
              const isEditing = editingCatId === cat.id;

              return (
                <div
                  key={cat.id}
                  className="p-3 rounded-[18px] flex items-center justify-between gap-2 text-xs frosted-surface hover:border-violet-500/30 transition-colors"
                >
                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-full bg-slate-900 border border-violet-500 text-white text-xs focus:outline-none"
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="w-8 h-8 rounded-full btn-primary-gradient text-white flex items-center justify-center active:scale-90"
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                      <button
                        onClick={() => setEditingCatId(null)}
                        className="w-8 h-8 rounded-full bg-white/10 text-white/70 flex items-center justify-center active:scale-90"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-bold text-white dark:text-white light:text-slate-900 truncate">{cat.name}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-violet-500/15 text-violet-300 font-semibold border border-violet-500/30">
                          {count} songs
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => handleStartEdit(cat)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 active:scale-90 transition-all"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleInitiateDelete(cat)}
                          className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-white/5 active:scale-90 transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Delete prompt with replacement picker */}
          {deletingCat && (
            <div className="p-4 rounded-[24px] bg-amber-500/15 border border-amber-500/30 space-y-3 text-xs animate-in fade-in">
              <div className="font-bold text-amber-200">
                Reassign Songs for "{deletingCat.name}"
              </div>
              <p className="text-slate-300 leading-relaxed">
                This category contains {getSongCountForCategory(deletingCat.id)} songs. Select a category to move them into:
              </p>
              <select
                value={replacementCatId}
                onChange={(e) => setReplacementCatId(e.target.value)}
                className="w-full px-4 py-2.5 rounded-full frosted-surface border border-white/10 text-white text-xs focus:outline-none focus:border-violet-500"
              >
                {categories
                  .filter((c) => c.id !== deletingCat.id)
                  .map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      {c.name}
                    </option>
                  ))}
              </select>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setDeletingCat(null)}
                  className="px-4 py-2 rounded-full text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmReassignDelete}
                  className="px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs active:scale-95 transition-all shadow-md"
                >
                  Reassign & Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
