import 'package:flutter/material.dart';

/// نظام الألوان المركزي للعبة — هوية "Premium Vault" (ذهبي/كحلي داكن).
///
/// كل الألوان المستخدمة في التطبيق يجب أن تُسحب من هنا فقط.
/// لتغيير الهوية البصرية الكاملة للعبة، يكفي تعديل هذا الملف.
class AppColors {
  AppColors._();

  // ===== ألوان الخلفية العامة =====
  static const Color backgroundLight = Color(0xFFFAF8F3);
  static const Color backgroundDark = Color(0xFF0B0F1F);
  static const Color backgroundElevatedDark = Color(0xFF10152B);

  // ===== ألوان لوحة اللعب =====
  static const Color boardBackgroundLight = Color(0xFFE4DFD3);
  static const Color boardBackgroundDark = Color(0xFF151B36);

  static const Color emptyCellLight = Color(0xFFD9D3C4);
  static const Color emptyCellDark = Color(0xFF1F2645);

  // ===== ألوان النصوص =====
  static const Color textPrimaryLight = Color(0xFF2B2A33);
  static const Color textPrimaryDark = Color(0xFFF3EFE3);
  static const Color textSecondaryLight = Color(0xFF6B6A75);
  static const Color textSecondaryDark = Color(0xFF8B92B8);

  // ===== ألوان العناصر التفاعلية (Premium Gold) =====
  static const Color primaryAccent = Color(0xFFF2B705);
  static const Color primaryAccentSecondaryStop = Color(0xFFE8940A);
  static const Color primaryAccentPressed = Color(0xFFD68C00);
  static const Color secondaryAccent = Color(0xFF7C5CFF);

  static const Color success = Color(0xFF34D399);
  static const Color danger = Color(0xFFF2555A);

  static const Color disabledLight = Color(0xFFBFBEC7);
  static const Color disabledDark = Color(0xFF3B4166);

  static const Color goldGlow = Color(0x59F2B705); // 35% opacity
  static const Color borderSoft = Color(0x2EF2B705); // 18% opacity

  /// تدرج الشعار والأزرار الأساسية.
  static const List<Color> goldGradient = [
    Color(0xFFFCE9A8),
    primaryAccent,
    primaryAccentSecondaryStop,
  ];

  /// ألوان الـ Tiles حسب القيمة (على الخلفية الداكنة).
  /// كل قيمة جديدة أعلى من 2048 تُبنى تلقائيًا (انظر [tileColorFor]).
  static const Map<int, Color> tileBackgroundColors = {
    2: Color(0xFF232A4E),
    4: Color(0xFF2E3560),
    8: Color(0xFFF2A65A),
    16: Color(0xFFF08A4B),
    32: Color(0xFFED6F3C),
    64: Color(0xFFE9522D),
    128: Color(0xFFF4C430),
    256: Color(0xFFF0B90B),
    512: Color(0xFF34D399),
    1024: Color(0xFF22C3B6),
    2048: Color(0xFF7C5CFF),
  };

  static const Map<int, Color> tileTextColors = {
    2: textPrimaryDark,
    4: textPrimaryDark,
    8: Color(0xFF241A0A),
    16: Color(0xFF241A0A),
    32: Color(0xFFFFFFFF),
    64: Color(0xFFFFFFFF),
    128: Color(0xFF241A0A),
    256: Color(0xFF241A0A),
    512: Color(0xFF0B2A20),
    1024: Color(0xFF052422),
    2048: Color(0xFFFFFFFF),
  };

  /// لون افتراضي للقيم الأعلى من 2048 (تدرج ثابت حتى لا ينهار التصميم).
  static const Color tileBackgroundOverflow = Color(0xFFB4308F);
  static const Color tileTextOverflow = Color(0xFFFFFFFF);

  static Color tileColorFor(int value) {
    return tileBackgroundColors[value] ?? tileBackgroundOverflow;
  }

  static Color tileTextColorFor(int value) {
    return tileTextColors[value] ?? tileTextOverflow;
  }
}
