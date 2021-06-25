변환 방법 가이드
================

# 최상위 `function` 을 class 로 변경.
# `:%s/^  function /  /g` : Nested 함수를 메소드로 변경.
# `:%s/^  let /  private /g` : 함수 내 전역 변수를 필드로 변경.
# VSCode 의 "add qualifier to all unresolved variables..." 리팩터를 이용해 `this.` 를 붙여준다.
# subscribe -> SlickGrid.trigger 에 호출되는 콜백의 경우 `this.` 를 `args.grid.` 로 변경한다.
# `= [];` 를 `= [] as any[];` 로 변경
# `= {};` 를 `= [] as AnyDict;` 로 변경 (`type AnyDict = {[key: string]: any} 추가)
# `fix all prefer-const` 리팩터 사용


