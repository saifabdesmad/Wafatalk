import { createAvatar } from '@dicebear/core';
import * as initials from '@dicebear/initials';

const LEGACY_BAD_AVATAR_PATTERNS = [
  'api.dicebear.com/7.x/bottts',
  'api.dicebear.com/7.x/avataaars',
  'dicebear.com/7.x/bottts',
  'images.unsplash.com/photo-15',
];

/**
 * Checks if an avatar URL belongs to the old legacy defaults (bottts robots or stock unsplash photos)
 * that should be replaced with DiceBear Initials.
 */
export function isLegacyDefaultAvatar(url?: string | null): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) return true;
  const lower = url.toLowerCase();
  return LEGACY_BAD_AVATAR_PATTERNS.some((p) => lower.includes(p));
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates an official DiceBear Initials SVG string for the given seed.
 */
export function generateInitialsSvg(seed: string, backgroundColor?: string): string {
  const cleanSeed = (seed || 'WT').trim() || 'WT';
  const options: any = {
    seed: cleanSeed,
    fontWeight: 600,
    fontSize: 44,
    fontFamily: ['Plus Jakarta Sans', 'Outfit', 'Arial', 'sans-serif'],
  };

  if (backgroundColor) {
    const hex = backgroundColor.replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      options.backgroundColor = [hex];
    }
  }

  let svg = createAvatar(initials, options).toString();

  // If seed has no letters (e.g. SuperAdmin "@"), ensure a crisp symbol appears instead of blank
  if (svg.includes('></text>')) {
    const fallbackLabel = escapeXml(cleanSeed.slice(0, 2).toUpperCase() || 'WT');
    svg = svg.replace('></text>', `>${fallbackLabel}</text>`);
  }

  return svg;
}

/**
 * Generates a self-contained SVG Data URI using DiceBear Initials.
 */
export function generateInitialsDataUri(seed: string, backgroundColor?: string): string {
  const svg = generateInitialsSvg(seed, backgroundColor);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Keeps real custom user-uploaded avatars intact, and upgrades missing or legacy bad defaults
 * to crisp DiceBear Initials avatars.
 */
export function resolveAvatarUrl(avatarUrl: string | null | undefined, fallbackSeed: string): string {
  if (avatarUrl && !isLegacyDefaultAvatar(avatarUrl)) {
    return avatarUrl;
  }
  return generateInitialsDataUri(fallbackSeed);
}
