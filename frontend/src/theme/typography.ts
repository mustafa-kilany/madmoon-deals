// Bundled font families (assets/fonts, one file per weight). Each name is the
// font's PostScript name, which is also its file name, so the same string works
// on Android and iOS. Tailwind exposes them as font-heading-black, font-sans-bold, …
//
// Prototype → app:  font-heading font-black → font-heading-black
//                   font-bold (body)        → font-sans-bold
// Never combine these with fontWeight: Android would fall back to the system font.

export const fontFamilies = {
  headingSemibold: 'Cairo-SemiBold',
  headingBold: 'Cairo-Bold',
  headingExtrabold: 'Cairo-ExtraBold',
  headingBlack: 'Cairo-Black',
  sansRegular: 'IBMPlexSansArabic-Regular',
  sansMedium: 'IBMPlexSansArabic-Medium',
  sansSemibold: 'IBMPlexSansArabic-SemiBold',
  sansBold: 'IBMPlexSansArabic-Bold',
} as const;
