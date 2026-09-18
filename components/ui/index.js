// 디자인 시스템 부품 모음 (AX-304 · spec 7장)
//
// 화면은 여기서 부품을 가져다 쓴다. 모양은 app/globals.css(토큰·기본) + app/styles/ui.css(부품)가 정한다.
// 부품을 고쳐야 하면 디자인 시스템 소유(AX-304)에 보고하고, 화면 배치는 자기 기능 스타일 파일에서 한다.
// 전체 견본은 /design-board 에서 본다.

export { default as AnswerInput } from './AnswerInput.js';
export { default as AppShell, NAV_HIDDEN_PATHS, STATUS_HIDDEN_PATHS } from './AppShell.js';
export { default as Badge, BADGE_KINDS } from './Badge.js';
export { default as BottomNav, NAV_ITEMS, activeNavHref } from './BottomNav.js';
export { default as Button } from './Button.js';
export { default as CategoryArt, ART_CATEGORIES } from './CategoryArt.js';
export { default as DateChip } from './DateChip.js';
export { default as DayTimeline } from './DayTimeline.js';
export { default as EmergencyButton } from './EmergencyButton.js';
export { default as EmptyState } from './EmptyState.js';
export { default as Icon, ICON_NAMES, STATE_ICON } from './Icon.js';
export { default as KoreanCard } from './KoreanCard.js';
export { default as MealSlot } from './MealSlot.js';
export { default as PeriodEditor } from './PeriodEditor.js';
export { default as PlaceCard, CATEGORY_KEY } from './PlaceCard.js';
export { default as ReadOnlyBanner } from './ReadOnlyBanner.js';
export { default as Sheet } from './Sheet.js';
export { default as SourceArea, SOURCE_KINDS, SourceTag } from './SourceArea.js';
export { default as TopBar } from './TopBar.js';
export { default as useStoreStatus, shouldShowReadOnly } from './useStoreStatus.js';
export { default as StateBanner } from '../StateBanner.js';
