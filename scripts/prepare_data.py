"""Validate the transcribed official tables and produce an offline-friendly asset."""
from pathlib import Path
from decimal import Decimal
import csv
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
EMPLOYMENT_URL = "https://www.stats.gov.cn/zt_18555/zthd/lhfw/2025/2025_zgjjpc/202502/t20250207_1958632.html"
WAGES_URL = "https://www.stats.gov.cn/xxgk/sjfb/zxfb2020/202605/t20260515_1963707.html"


def verify_against_evidence(rows):
    """Compare each value against its actual source-table row, including blanks."""
    def table(filename, start, end):
        text = (ROOT / "data/raw" / filename).read_text(encoding="utf-8")
        section = text.split(start, 1)[1].split(end, 1)[0]
        result = {}
        for line in section.splitlines():
            line = re.sub(r"^L\d+:\s*", "", line)
            cells = [part.strip() for part in line.split("|")]
            if len(cells) >= 4 and cells[1] not in ("", "2025年", "法人单位 从业人员 （万人）"):
                try:
                    values = [float(v) if v != "-" else None for v in cells[1:]]
                except ValueError:
                    continue
                result[cells[0].replace("*", "")] = values
        return result
    employment = table("employment-2023-web.txt", "表2-3　按行业门类分组的法人单位与个体经营户从业人员", "三、资产负债")
    wages_nonprivate = table("wages-2025-web.txt", "表2　2025年城镇非私营单位分行业门类就业人员年平均工资及增速", "表3　")
    wages_private = table("wages-2025-web.txt", "表5　2025年城镇私营单位分行业门类就业人员年平均工资及增速", "三、规模以上")
    assert len(employment) == 20 and len(wages_nonprivate) == 20 and len(wages_private) == 19
    for row in rows:
        name = "农、林、牧、渔业" if row["code"] == "A" else row["name"]
        expected = [row[k] for k in ("employment_legal_10k", "female_legal_10k", "employment_individual_10k", "female_individual_10k")]
        assert employment[name] == expected, (name, "employment", employment[name], expected)
        if row["code"] == "A":
            # Auxiliary activity counts cannot be joined to full agriculture wages.
            assert row["wage_private_2025"] is None and row["wage_nonprivate_2025"] is None
            continue
        for ownership, source in (("private", wages_private), ("nonprivate", wages_nonprivate)):
            expected = [row[f"wage_{ownership}_2025"], row[f"wage_{ownership}_2024"], row[f"growth_{ownership}"]]
            assert source.get(name, [None, None, None]) == expected, (name, ownership)
    assert employment["合　计"] == [42898.4, 17047.4, 17956.4, 8420.0]


def build():
    rows = list(csv.DictReader((ROOT / "data/industries.csv").open(encoding="utf-8")))
    assert len(rows) == 19 and {r["code"] for r in rows} == set("ABCDEFGHIJKLMNOPQRS")
    numeric = set(rows[0]) - {"code", "name", "short_name", "ai_rationale"}
    for r in rows:
        for key in numeric:
            r[key] = float(r[key]) if r[key] else None
        r["sector"] = "industrial" if r["code"] in "BCD" else "construction" if r["code"] == "E" else "services"
        r["employment_source"] = "economic_census_2023"
        r["wage_source"] = "urban_wages_2025" if r["wage_nonprivate_2025"] else None
        for scope in ("legal", "individual"):
            total, female = r[f"employment_{scope}_10k"], r[f"female_{scope}_10k"]
            assert (total is None) == (female is None)
            assert total is None or 0 <= female <= total
        assert 0 <= r["ai_exposure"] <= 10 and r["ai_rationale"]
        for ownership in ("private", "nonprivate"):
            current, prior, growth = (r[f"wage_{ownership}_2025"], r[f"wage_{ownership}_2024"], r[f"growth_{ownership}"])
            assert all(v is None for v in (current, prior, growth)) or all(v is not None for v in (current, prior, growth))
            if current is not None:
                assert current > 0 and prior > 0
                assert abs((current / prior - 1) * 100 - growth) <= 0.06
    verify_against_evidence(rows)
    # Published rows are rounded to 0.1 万人, so retain official totals and record the residual.
    sums = {key: sum(Decimal(str(r[key])) for r in rows if r[key] is not None) for key in ("employment_legal_10k", "female_legal_10k", "employment_individual_10k", "female_individual_10k")}
    totals = {"employment_legal_10k": 42898.4, "female_legal_10k": 17047.4, "employment_individual_10k": 17956.4, "female_individual_10k": 8420.0}
    for key, total in totals.items():
        assert abs(sums[key] - Decimal(str(total))) <= Decimal("1.0"), (key, sums[key])
    sources = [{"id": "economic_census_2023", "title": "第五次全国经济普查公报（第二号）· 表2-3", "url": EMPLOYMENT_URL, "published_at": "2024-12-26", "reference_year": 2023, "accessed_at": "2026-10-08", "method": "Official web tables transcribed and validated", "scope": "第二、三产业法人单位与个体经营户；农林牧渔仅含专业及辅助性活动"}, {"id": "urban_wages_2025", "title": "2025年城镇单位就业人员年平均工资情况 · 表2、表5", "url": WAGES_URL, "published_at": "2026-05-15", "reference_year": 2025, "accessed_at": "2026-10-08", "method": "Official web tables transcribed and validated", "scope": "城镇地域内就业人数5人及以上法人单位；不含个体工商户与自由职业者"}]
    evidence = [{"file": p.name, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((ROOT / "data/raw").glob("*.txt"))]
    assert len(evidence) == 2
    data = {"version": "1.0.0", "verified_at": "2026-10-08", "employment_year": 2023, "wage_year": 2025, "totals": totals, "row_sums": {k: float(v) for k, v in sums.items()}, "sources": sources, "evidence": evidence, "ai": {"author": "Codex", "method": "模型基于行业一般任务结构的粗粒度主观评估；未使用职业任务微观数据、就业加权或外部模型API", "date": "2026-10-08", "scale": "0–10，表示当前数字AI对工作任务的潜在重塑程度", "limitations": "非官方统计、非经验证研究、非失业概率；行业内不同职业差异很大；不含机器人与自动驾驶的全面影响", "prompt": "按中国国民经济行业门类，估计当前数字AI对一般工作任务的影响程度，0至10分。考虑文本、代码、分析、内容生产与信息处理任务，以及现场操作、人际关系、监管责任等约束。分数仅用于探索，不是职业替代率，也不是就业预测。各行业给出评分理由，说明行业内异质性；不声称以就业人数对职业任务加权。"}, "industries": rows}
    content = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    (ROOT / "dist/data.json").write_text(content, encoding="utf-8")
    (ROOT / "dist/data.js").write_text("window.CHINA_JOBS_DATA = " + content.rstrip() + ";\n", encoding="utf-8")
    print(json.dumps({"industries": len(rows), "official_totals": totals, "row_sums": data["row_sums"], "wages_private_available": sum(r["wage_private_2025"] is not None for r in rows), "wages_nonprivate_available": sum(r["wage_nonprivate_2025"] is not None for r in rows)}, ensure_ascii=False))


if __name__ == "__main__":
    build()

