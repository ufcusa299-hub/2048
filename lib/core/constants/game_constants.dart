/// ثوابت منطق اللعبة الصرف.
///
/// أي قيمة هنا تؤثر على سلوك اللعبة (وليس الشكل البصري).
class GameConstants {
  GameConstants._();

  /// حجم اللوحة (4 يعني شبكة 4x4).
  static const int boardSize = 4;

  /// القيم التي يمكن أن يبدأ بها Tile جديد، مع احتمالها.
  /// المجموع يجب أن يساوي 1.0.
  static const Map<int, double> spawnProbabilities = {
    2: 0.9,
    4: 0.1,
  };

  /// عدد الـ Tiles التي تظهر عند بدء لعبة جديدة.
  static const int initialTileCount = 2;

  /// القيمة التي عند الوصول إليها تُعرض رسالة الفوز.
  static const int winValue = 2048;

  /// أقل مسافة سحب (بالبكسل المنطقي) لاعتبارها Swipe فعلي.
  /// أي حركة أقل من هذه المسافة يتم تجاهلها بالكامل.
  static const double minSwipeDistance = 16.0;

  /// أقل سرعة سحب (بكسل/ملي ثانية) كإشارة داعمة لاكتشاف الاتجاه
  /// في حال كانت المسافة قريبة من الحد الأدنى.
  static const double minSwipeVelocity = 0.3;
}
