"""فحص سلسلة العهدة — يُشغَّل على SQLite في الذاكرة، بلا شبكة ولا قاعدة إنتاج."""
import os, sys, json
from datetime import date
sys.path.insert(0, os.getcwd())
os.environ.setdefault("DATABASE_URL", "sqlite://")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
import pkgutil, importlib, app.models as _m          # حمّل كل الموديلات
for _mod in pkgutil.iter_modules(_m.__path__):
    importlib.import_module(f"app.models.{_mod.name}")
from app.models.settlement import EmployeeSettlement, EmployeeCustody, CustodyTopupLog
from app.routers.settlements import _rebuild_chain, _walk

eng = create_engine("sqlite://")
EmployeeCustody.__table__.create(eng); EmployeeSettlement.__table__.create(eng); CustodyTopupLog.__table__.create(eng)
S = sessionmaker(bind=eng)
db = S()

NAME = "عمر"
db.add(EmployeeCustody(employee_name=NAME, opening_seed=1000)); db.flush()

def stl(d, spent, custody=0, returned=0):
    s = EmployeeSettlement(employee_name=NAME, date=date.fromisoformat(d),
                           month=int(d[5:7]), year=int(d[:4]),
                           expense_items="[]", total_spent=spent,
                           custody_added=custody, returned_amount=returned)
    db.add(s); db.flush(); return s

def top(d, amt):
    t = CustodyTopupLog(employee_name=NAME, amount=amt, topup_date=date.fromisoformat(d),
                        month=int(d[5:7]), year=int(d[:4]))
    db.add(t); db.flush(); return t

fails = []
def chk(label, got, want):
    ok = abs(got - want) < 0.005
    print(("  ✅" if ok else "  ❌") + f" {label}: {got} (المتوقَّع {want})")
    if not ok: fails.append(label)

print("1) رد العهدة يدخل الرصيد الختامي")
a = stl("2026-10-01", spent=300, custody=0, returned=200)
c, _ = _rebuild_chain(NAME, db)
chk("افتتاحي أول تسوية = البذرة", a.opening_balance, 1000)
chk("ختامي = 1000 − 300 − 200", a.closing_balance, 500)
chk("رصيد الموظف", c.current_balance, 500)

print("2) تمويل بين تسويتين يدخل السلسلة")
top("2026-10-05", 2000)
b = stl("2026-10-07", spent=400)
c, info = _rebuild_chain(NAME, db)
chk("افتتاحي الثانية = 500 + 2000", b.opening_balance, 2500)
chk("ختامي الثانية", b.closing_balance, 2100)
chk("إجمالي المُعطى = 1000 + 2000", c.total_given, 3000)

print("3) تسوية بتاريخ قديم تُعيد ترتيب السلسلة")
z = stl("2026-10-03", spent=100)          # تُسجَّل الآن لكن تاريخها قبل التمويل
_rebuild_chain(NAME, db)
chk("افتتاحي القديمة = ختامي 01/10", z.opening_balance, 500)
chk("ختامي القديمة", z.closing_balance, 400)
chk("افتتاحي 07/10 اتزحزح", b.opening_balance, 2400)
chk("ختامي 07/10", b.closing_balance, 2000)

print("4) حذف تسوية من المنتصف يصحّح ما بعدها")
db.delete(z); db.flush()
c, _ = _rebuild_chain(NAME, db)
chk("افتتاحي 07/10 رجع", b.opening_balance, 2500)
chk("رصيد الموظف", c.current_balance, 2100)

print("5) تعديل المصروف يصحّح كل اللاحق")
a.total_spent = 500
_rebuild_chain(NAME, db)
chk("ختامي 01/10", a.closing_balance, 300)
chk("افتتاحي 07/10", b.opening_balance, 2300)
chk("ختامي 07/10", b.closing_balance, 1900)

print("6) الإجماليات تُشتقّ ولا تُمحى")
c, info = _rebuild_chain(NAME, db)
chk("المُعطى", c.total_given, 3000)
chk("المصروف", c.total_spent, 900)
chk("المردود", info["total_returned"], 200)
chk("الاتزان: مُعطى − مصروف − مردود = الرصيد", c.total_given - c.total_spent - info["total_returned"], c.current_balance)

print("7) كل افتتاحي = ختاميُّ سابقه (فحص السلسلة)")
_, walk = _walk(NAME, db)
breaks = sum(1 for i in range(1, len(walk)) if abs(walk[i]["opening"] - walk[i-1]["closing"]) > 0.005)
chk("كسور السلسلة", breaks, 0)

print("8) ترحيل البيانات القديمة لا يبخّر رصيد أحد")
OLD = "موظف قديم"
db.add(EmployeeCustody(employee_name=OLD, current_balance=5000, total_given=9000, total_spent=4000))
db.flush()
for d, amt in (("2026-09-02", 500), ("2026-09-11", 300)):
    db.add(EmployeeSettlement(employee_name=OLD, date=date.fromisoformat(d), month=9, year=2026,
                              expense_items="[]", total_spent=amt,
                              opening_balance=0, closing_balance=0))
db.flush()
co, _ = _rebuild_chain(OLD, db)
chk("الرصيد المعروض ما اتغيّرش", co.current_balance, 5000)
chk("البذرة = 5000 + 800 المصروف", co.opening_seed, 5800)
_, w2 = _walk(OLD, db)
chk("كسور سلسلته", sum(1 for i in range(1, len(w2)) if abs(w2[i]["opening"] - w2[i-1]["closing"]) > 0.005), 0)
co2, _ = _rebuild_chain(OLD, db)   # الترحيل مرة واحدة فقط
chk("إعادة التشغيل ما تزحزحش الرصيد", co2.current_balance, 5000)
chk("ولا البذرة", co2.opening_seed, 5800)

print("\n" + ("❌ فشل: " + ", ".join(fails) if fails else "✅ كل الفحوص خضراء"))
sys.exit(1 if fails else 0)
