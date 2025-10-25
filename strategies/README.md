# FVG Confluence Strategy

## Tổng Quan (Overview)

Chiến lược FVG Confluence (Fair Value Gap Confluence Strategy) là một hệ thống giao dịch kết hợp phát hiện Fair Value Gap với nhiều chỉ báo kỹ thuật khác nhau thông qua một hệ thống tính điểm có trọng số (weighted confluence scoring).

This is a trading strategy that combines Fair Value Gap detection with multiple technical indicators using a weighted confluence scoring system.

## Cấu Trúc Dự Án (Project Structure)

```
strategies/
├── __init__.py                    # Package initializer
├── confluence_scorer.py           # Confluence scoring system
└── fvg_confluence_strategy.py     # Main FVG strategy implementation

tests/
├── __init__.py
├── test_confluence_scorer.py      # Tests for ConfluenceScorer
└── test_fvg_confluence_strategy.py # Tests for FVGConfluenceStrategy
```

## Các Thành Phần Chính (Main Components)

### 1. ConfluenceScorer

Lớp này tính toán điểm confluence dựa trên tín hiệu từ nhiều chỉ báo khác nhau với trọng số có thể tùy chỉnh.

**Tham số khởi tạo:**
- `weights` (dict): Trọng số cho mỗi chỉ báo (tổng = 100)
- `adx_enabled` (bool): Bật/tắt lọc ADX
- `adx_threshold` (float): Ngưỡng ADX (mặc định: 25.0)

**Phương thức chính:**
- `calculate_score(indicator_signals)`: Tính điểm confluence từ tín hiệu các chỉ báo
- `evaluate_with_adx(indicator_signals, adx_value)`: Đánh giá với lọc ADX
- `update_weights(new_weights)`: Cập nhật trọng số

### 2. FVGConfluenceStrategy

Chiến lược chính kết hợp phát hiện FVG với các chỉ báo kỹ thuật.

**Cấu hình mặc định:**
```python
weights = {
    'fvg': 60,      # FVG có trọng số cao nhất (chỉ báo chính)
    'vwap': 15,     # VWAP xác nhận xu hướng
    'obv': 15,      # OBV xác thực dòng volume
    'volume': 10,   # Volume xác nhận sự tham gia thị trường
}

adx_enabled = True
adx_threshold = 25.0  # ADX > 25 cho thấy xu hướng mạnh
```

## Giải Thích Các Chỉ Báo (Indicator Explanations)

### Fair Value Gap (FVG)
**Trọng số: 60%**

Fair Value Gap là khoảng trống giá trên thị trường đại diện cho sự mất cân bằng giữa người mua và người bán.

**Phát hiện FVG:**
- **Bullish FVG**: Giá thấp của nến hiện tại > Giá cao của nến 2 chu kỳ trước
- **Bearish FVG**: Giá cao của nến hiện tại < Giá thấp của nến 2 chu kỳ trước

### VWAP (Volume Weighted Average Price)
**Trọng số: 15%**

VWAP cung cấp xác nhận xu hướng:
- Giá > VWAP: Tín hiệu tăng (+1)
- Giá < VWAP: Tín hiệu giảm (-1)
- Giá = VWAP: Trung lập (0)

### OBV (On Balance Volume)
**Trọng số: 15%**

OBV xác thực dòng volume:
- OBV tăng: Tín hiệu tăng (+1)
- OBV giảm: Tín hiệu giảm (-1)
- OBV không đổi: Trung lập (0)

### Volume
**Trọng số: 10%**

Xác nhận sự tham gia thị trường:
- Volume > 1.5x trung bình: Tín hiệu mạnh (+1)
- Volume < 0.5x trung bình: Tín hiệu yếu (-1)
- Volume bình thường: Trung lập (0)

### ADX (Average Directional Index)
**Ngưỡng: 25.0**

ADX đo lường độ mạnh của xu hướng:
- ADX > 25: Xu hướng mạnh (strong trend)
- ADX ≤ 25: Xu hướng yếu (weak trend)

Chiến lược chỉ thực hiện giao dịch khi ADX > ngưỡng.

## Cách Sử Dụng (Usage)

### Khởi Tạo Chiến Lược

```python
from strategies.fvg_confluence_strategy import FVGConfluenceStrategy

# Khởi tạo với cấu hình mặc định
strategy = FVGConfluenceStrategy()

# Kiểm tra cấu hình
config = strategy.get_configuration()
print(config)
```

### Tạo Tín Hiệu Giao Dịch

```python
# Chuẩn bị dữ liệu thị trường
market_data = {
    'candles': [
        {'open': 100, 'high': 105, 'low': 98, 'close': 103},
        {'open': 103, 'high': 108, 'low': 102, 'close': 106},
        {'open': 110, 'high': 115, 'low': 109, 'close': 112},
    ],
    'vwap': 105,
    'obv_current': 1000,
    'obv_previous': 900,
    'volume_current': 1600,
    'volume_average': 1000,
    'adx': 30.0
}

# Tạo tín hiệu
signal = strategy.generate_signal(market_data)

print(f"Action: {signal['action']}")          # BUY, SELL, or HOLD
print(f"Score: {signal['score']}")            # -100 to 100
print(f"Strong Trend: {signal['strong_trend']}")  # True/False
print(f"Components: {signal['components']}")  # Individual signals
```

### Kết Quả Tín Hiệu

```python
{
    'action': 'BUY',           # Hành động: BUY, SELL, HOLD
    'score': 95.0,             # Điểm confluence: -100 đến 100
    'strong_trend': True,      # ADX xác nhận xu hướng mạnh
    'components': {
        'fvg': 1,              # Tín hiệu từng chỉ báo
        'vwap': 1,
        'obv': 1,
        'volume': 1
    },
    'fvg_gap_info': {
        'type': 'bullish',
        'gap_start': 105,
        'gap_end': 109,
        'gap_size': 4
    }
}
```

## Quy Tắc Giao Dịch (Trading Rules)

1. **BUY Signal**:
   - Score > 50
   - strong_trend = True (ADX > 25)

2. **SELL Signal**:
   - Score < -50
   - strong_trend = True (ADX > 25)

3. **HOLD**:
   - Score giữa -50 và 50, HOẶC
   - strong_trend = False (ADX ≤ 25)

## Tùy Chỉnh Chiến Lược (Customization)

### Thay Đổi Trọng Số (Changing Weights)

Để tùy chỉnh trọng số, chỉnh sửa phương thức `_setup_confluence_scorer()` trong file `strategies/fvg_confluence_strategy.py`:

```python
def _setup_confluence_scorer(self):
    # Tùy chỉnh trọng số theo nhu cầu
    weights = {
        'fvg': 70,      # Tăng FVG weight lên 70%
        'vwap': 10,     # Giảm VWAP weight xuống 10%
        'obv': 10,      # Giảm OBV weight xuống 10%
        'volume': 10,   # Giữ volume weight ở 10%
    }

    self.confluence_scorer = ConfluenceScorer(
        weights=weights,
        adx_enabled=True,
        adx_threshold=30.0  # Tăng ADX threshold lên 30
    )
```

### Tắt ADX Filtering

```python
self.confluence_scorer = ConfluenceScorer(
    weights=weights,
    adx_enabled=False,  # Tắt ADX filtering
    adx_threshold=25.0
)
```

## Chạy Tests (Running Tests)

```bash
# Chạy tất cả tests
python3 -m unittest discover tests -v

# Chạy test riêng cho ConfluenceScorer
python3 -m unittest tests/test_confluence_scorer.py -v

# Chạy test riêng cho FVGConfluenceStrategy
python3 -m unittest tests/test_fvg_confluence_strategy.py -v
```

## Ví Dụ Kết Quả Test (Test Results)

```
Ran 31 tests in 0.002s
OK
```

Tất cả 31 test cases đều pass, bao gồm:
- 12 tests cho ConfluenceScorer
- 19 tests cho FVGConfluenceStrategy

## Lưu Ý Quan Trọng (Important Notes)

1. **Tổng trọng số**: Tổng trọng số của các chỉ báo phải bằng 100. Hệ thống tự động chuẩn hóa nếu tổng khác 100.

2. **Tín hiệu chỉ báo**: Tất cả tín hiệu chỉ báo nằm trong khoảng [-1, 1]:
   - 1: Bullish (tăng)
   - 0: Neutral (trung lập)
   - -1: Bearish (giảm)

3. **Điểm Confluence**: Điểm cuối cùng nằm trong khoảng [-100, 100]:
   - 100: Tất cả chỉ báo đều bullish
   - 0: Trung lập
   - -100: Tất cả chỉ báo đều bearish

4. **ADX Filtering**: Khi ADX enabled, tín hiệu chỉ được thực hiện khi ADX > threshold, giúp tránh giao dịch trong thị trường sideway (đi ngang).

## Giải Thích "Chỗ này tôi không hiểu"

Đoạn code trong problem statement:

```python
def _setup_confluence_scorer(self):
    # Thay đổi weights
    weights = {
        'fvg': 60,      # Tăng FVG weight
        'vwap': 15,     # Giảm VWAP weight
        'obv': 15,
        'volume': 10,
    }

    self.confluence_scorer = ConfluenceScorer(
        weights=weights,
        adx_enabled=True,
        adx_threshold=25.0  # Thay đổi ADX threshold
    )
```

**Giải thích chi tiết:**

1. **Weights (Trọng số)**:
   - Mỗi chỉ báo có một trọng số quyết định mức độ quan trọng của nó trong quyết định cuối cùng
   - FVG có trọng số 60% vì đây là chỉ báo chính của chiến lược
   - VWAP, OBV, Volume có trọng số thấp hơn (15%, 15%, 10%) vì chúng chỉ là chỉ báo xác nhận

2. **ADX Enabled**:
   - Khi `True`, chiến lược sẽ kiểm tra ADX trước khi thực hiện giao dịch
   - Giúp tránh giao dịch trong thị trường không có xu hướng rõ ràng

3. **ADX Threshold**:
   - Giá trị ngưỡng là 25.0
   - Chỉ giao dịch khi ADX > 25, nghĩa là thị trường đang có xu hướng mạnh
   - ADX < 25 thường cho thấy thị trường đi ngang, không phù hợp để giao dịch theo xu hướng

## License

MIT
