"""Syntactically valid logic-review DATA: 8 buggy and 2 correct functions.

Logic review: cursor inside a function -> "Autocorrect: Check for Logic Bugs";
results appear in Problems. Review ONE function at a time, no selection/staging
left from another test. Output -> "LLM Autocorrect" (autocorrect.debug: true)
shows [logic]. Source is autocorrect (logic). No code is applied automatically.
Read suggestion, try optional Apply suggestion (if supplied), then Undo; also
test Dismiss logic suggestion and Autocorrect: Clear Logic Suggestions.
Comments state contracts, so the sole intended bug in each function is clear.
"""


# 1. Off-by-one: sum every element, including last; [] should yield 0.
def sum_all(xs):
    total = 0
    # expect: range(len(xs) - 1) -> range(len(xs)); [2, 3] should yield 5
    for index in range(len(xs) - 1):
        total += xs[index]
    return total


# 2. Inverted condition: an adult is anyone age >= 18.
def is_adult(age):
    # expect: age < 18 -> age >= 18; 20 should yield True
    if age < 18:
        return True
    return False


# 3. Mutable default: calls without a supplied bucket must get separate lists.
# expect: bucket=[] -> bucket=None and initialize a fresh [] when None
def collect_item(item, bucket=[]):
    bucket.append(item)
    return bucket


# 4. Wrong return variable: return discounted amount, never original amount.
def discounted_price(price, fraction):
    discounted = price * (1 - fraction)
    # expect: return price -> return discounted; (100, 0.2) should yield 80
    return price


# 5. Division for index: input xs is nonempty; choose upper middle for even size.
def middle_item(xs):
    # expect: / -> // so middle is an integer usable as a list index
    middle = len(xs) / 2
    return xs[middle]


# 6. Missing return in one branch: guests must receive the string "guest".
def display_name(name):
    if name:
        return name.strip()
    else:
        # expect: "guest" -> return "guest"; empty input must not yield None
        "guest"


# 7. None handling: optional name may be None, which should yield "guest".
def normalize_name(name):
    # expect: guard name is None and return "guest" before calling strip
    return name.strip().lower()


# 8. Wrong accumulator: total_price must sum prices; item_count counts items.
def total_cost(prices):
    total_price = 0
    item_count = 0
    for price in prices:
        # expect: item_count += price -> total_price += price
        item_count += price
        item_count += 1
    return total_price


# 9. Correct control: sum nonnegative entries, including zero; negatives ignored.
# expect: no logic issues found; Problems must gain no issue for this function
def sum_nonnegative(values):
    total = 0
    for value in values:
        if value >= 0:
            total += value
    return total


# 10. Correct control: return first matching index or -1, including empty lists.
# expect: no logic issues found; no off-by-one or missing-return suggestion
def find_index(values, target):
    for index, value in enumerate(values):
        if value == target:
            return index
    return -1
