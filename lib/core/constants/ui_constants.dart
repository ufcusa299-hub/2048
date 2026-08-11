import 'package:flutter/animation.dart';

/// ثوابت الواجهة، القياسات، والـ Animations.
class UiConstants {
  UiConstants._();

  // ===== المسافات والقياسات =====
  static const double screenPadding = 20.0;
  static const double boardPadding = 12.0;
  static const double tileSpacing = 10.0;
  static const double tileCornerRadius = 12.0;
  static const double boardCornerRadius = 18.0;
  static const double buttonCornerRadius = 16.0;

  // ===== أحجام الخطوط داخل الـ Tile حسب طول الرقم =====
  // يُستخدم لتصغير الخط تلقائيًا عند وصول القيم لأرقام كبيرة جدًا.
  static const double tileFontSizeShort = 32.0; // 1-2 خانات
  static const double tileFontSizeMedium = 26.0; // 3 خانات
  static const double tileFontSizeLong = 20.0; // 4 خانات
  static const double tileFontSizeExtraLong = 16.0; // 5+ خانات

  // ===== مدد الـ Animations (بالميلي ثانية) =====
  static const Duration splashDuration = Duration(milliseconds: 1400);
  static const Duration moveAnimationDuration = Duration(milliseconds: 120);
  static const Duration mergeAnimationDuration = Duration(milliseconds: 140);
  static const Duration newTileAnimationDuration = Duration(milliseconds: 160);
  static const Duration scorePopupDuration = Duration(milliseconds: 500);
  static const Duration buttonPressAnimationDuration =
      Duration(milliseconds: 100);
  static const Duration overlayAnimationDuration = Duration(milliseconds: 250);

  // ===== منحنيات الحركة =====
  static const Curve moveCurve = Curves.easeOutCubic;
  static const Curve mergeCurve = Curves.easeOutBack;
  static const Curve newTileCurve = Curves.easeOutBack;

  // ===== الحد الأدنى لحجم عناصر اللمس =====
  static const double minTouchTargetSize = 48.0;
}
