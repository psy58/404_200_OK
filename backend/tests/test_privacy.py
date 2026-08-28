"""주민등록번호 마스킹 — md 산출물에 주민번호가 남지 않게 한다."""

from app.ingest.privacy import MASK, mask_rrns


def test_hyphenated_rrn_is_masked():
    masked, count = mask_rrns("인솔자 홍길동(920131-2345678) 외 1명")
    assert count == 1
    assert "2345678" not in masked
    assert MASK in masked


def test_spaced_hyphen_and_foreigner_code():
    text = "보호자: 850615 - 1234567 / 외국인 강사: 900101-5678901"
    masked, count = mask_rrns(text)
    assert count == 2
    assert "1234567" not in masked and "5678901" not in masked


def test_bare_thirteen_digits():
    masked, count = mask_rrns("주민등록번호 0203043456789 기재")
    assert count == 1
    assert "0203043456789" not in masked


def test_ordinary_numbers_survive():
    text = (
        "2026-08-29 회의, 예산 1,234,567원, 연락처 010-1234-5678, "
        "문서번호 숭의여고-2025-1234567, 계좌 100-123-456789"
    )
    masked, count = mask_rrns(text)
    assert count == 0
    assert masked == text


def test_invalid_date_part_is_not_masked():
    # 월 13, 일 32 — 생년월일 꼴이 아니면 주민번호로 보지 않는다
    masked, count = mask_rrns("일련번호 921332-1234567")
    assert count == 0


def test_digits_glued_to_neighbors_are_not_masked():
    masked, count = mask_rrns("승인번호 1920131-2345678 / 2920131-23456789")
    assert count == 0
