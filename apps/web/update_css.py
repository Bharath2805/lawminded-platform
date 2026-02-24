import re

with open("src/app/globals.css", "r") as f:
    css = f.read()

# RGB Replacements
css = css.replace("45, 212, 191", "0, 229, 255")
css = css.replace("96, 165, 250", "79, 70, 229")
css = css.replace("34, 211, 197", "0, 229, 255")
css = css.replace("143, 177, 228", "255, 255, 255")
css = css.replace("18, 31, 52", "10, 10, 10")
css = css.replace("137, 170, 220", "255, 255, 255")
css = css.replace("6, 12, 24", "0, 0, 0")
css = css.replace("12, 22, 40", "5, 5, 5")
css = css.replace("12, 20, 35", "5, 5, 5")
css = css.replace("126, 159, 209", "255, 255, 255")
css = css.replace("134, 169, 224", "255, 255, 255")
css = css.replace("18, 35, 57", "15, 15, 15")
css = css.replace("12, 23, 41", "15, 15, 15")
css = css.replace("120, 166, 237", "255, 255, 255")
css = css.replace("22, 36, 60", "12, 12, 12")
css = css.replace("12, 20, 37", "12, 12, 12")
css = css.replace("3, 8, 19", "0, 0, 0")
css = css.replace("124, 163, 226", "255, 255, 255")
css = css.replace("10, 19, 35", "10, 10, 10")
css = css.replace("8, 15, 28", "8, 8, 8")
css = css.replace("148, 181, 230", "255, 255, 255")
css = css.replace("17, 31, 52", "17, 17, 17")

# Hex Replacements
css = css.replace("#8ef6eb", "var(--accent)")
css = css.replace("#8cf9ed", "var(--accent)")
css = css.replace("#c4d1e8", "var(--text-secondary)")
css = css.replace("#eff8ff", "var(--text-primary)")
css = css.replace("#f3fffd", "var(--accent)")
css = css.replace("#8cf6ea", "var(--accent)")
css = css.replace("#ecf7ff", "var(--text-primary)")
css = css.replace("#dceaff", "var(--text-primary)")

with open("src/app/globals.css", "w") as f:
    f.write(css)
