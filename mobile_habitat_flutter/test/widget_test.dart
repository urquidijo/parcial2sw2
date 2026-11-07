import 'package:flutter_test/flutter_test.dart';
import 'package:habitat_pro_mobile/main.dart';

void main() {
  testWidgets('Habitat Pro Mobile smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const HabitatProMobileApp());
    expect(find.text('Habitat Pro Mobile'), findsOneWidget);
  });
}
