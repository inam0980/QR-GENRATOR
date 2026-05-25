"""
LinkDrop — Selenium automation test (local file:// run)
========================================================

Setup (one-time):
    pip install selenium webdriver-manager

Run:
    python test.py

Yeh script Chrome open karega, index.html load karega, full signup + add link
+ QR + snapshot + logout + re-login flow test karega.
"""

import os
import time
import random
import string

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

try:
    from webdriver_manager.chrome import ChromeDriverManager
    HAS_WDM = True
except ImportError:
    HAS_WDM = False


# ----------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))

# Toggle target: "deployed" or "local"
TARGET = "deployed"

DEPLOYED_URL = "https://qrlinkgen.netlify.app/"
LOCAL_URL = "file:///" + os.path.join(HERE, "index.html").replace("\\", "/")

INDEX_URL = DEPLOYED_URL if TARGET == "deployed" else LOCAL_URL

HEADLESS = False        # True karoge to browser hide rahega
WAIT_TIMEOUT = 15       # max seconds for any wait (deployed needs a bit more)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def rand_username():
    """e.g. abc12 — 3 letters + 2 digits, must mix per app validation."""
    letters = "".join(random.choices(string.ascii_lowercase, k=3))
    digits = "".join(random.choices(string.digits, k=2))
    return letters + digits


def make_driver():
    opts = Options()
    if HEADLESS:
        opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1280,900")
    opts.add_experimental_option("excludeSwitches", ["enable-logging"])
    # Allow localStorage on file:// URLs (only needed for local target)
    if TARGET == "local":
        opts.add_argument("--allow-file-access-from-files")
    # Reduce noise & speed up
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--disable-notifications")

    if HAS_WDM:
        service = Service(ChromeDriverManager().install())
        return webdriver.Chrome(service=service, options=opts)
    return webdriver.Chrome(options=opts)


def log(step, msg=""):
    print(f"[{step:>6}] {msg}")


def wait_visible(driver, by, sel, t=WAIT_TIMEOUT):
    return WebDriverWait(driver, t).until(EC.visibility_of_element_located((by, sel)))


def wait_clickable(driver, by, sel, t=WAIT_TIMEOUT):
    return WebDriverWait(driver, t).until(EC.element_to_be_clickable((by, sel)))


def wait_hidden(driver, by, sel, t=WAIT_TIMEOUT):
    return WebDriverWait(driver, t).until(EC.invisibility_of_element_located((by, sel)))


# ----------------------------------------------------------------------
# Test steps
# ----------------------------------------------------------------------
def test_signup(driver, name, username):
    log("SIGNUP", f"name='{name}' username='{username}'")
    wait_visible(driver, By.ID, "welcomeScreen")

    # Signup tab is active by default
    wait_visible(driver, By.ID, "wName").send_keys(name)
    driver.find_element(By.ID, "wUsername").send_keys(username)
    driver.find_element(By.CSS_SELECTOR, "#signupForm button[type='submit']").click()

    # Token modal appears
    wait_visible(driver, By.ID, "tokenModal")
    token = driver.find_element(By.ID, "tokenDisplay").text.strip()
    assert token.isdigit() and len(token) == 2, f"Expected 2-digit token, got {token!r}"
    log("TOKEN", f"received: {token}")

    # 10-second countdown — wait for the button to enable
    enter_btn = WebDriverWait(driver, 15).until(
        lambda d: d.find_element(By.ID, "enterAppBtn") if not d.find_element(By.ID, "enterAppBtn").get_attribute("disabled") else False
    )
    enter_btn.click()
    wait_hidden(driver, By.ID, "welcomeScreen")
    log("SIGNUP", "entered app ✓")
    return token


def test_add_link(driver, platform_key, title, url):
    log("LINK", f"adding {platform_key}: '{title}' -> {url}")

    tile = wait_clickable(driver, By.CSS_SELECTOR, f".platform-tile[data-key='{platform_key}']")
    tile.click()

    # Add-link modal opens
    wait_visible(driver, By.ID, "modal")
    title_input = driver.find_element(By.ID, "title")
    title_input.clear()
    title_input.send_keys(title)
    driver.find_element(By.ID, "url").send_keys(url)
    driver.find_element(By.CSS_SELECTOR, "#linkForm button[type='submit']").click()

    wait_hidden(driver, By.ID, "modal")
    log("LINK", "saved ✓")


def test_qr_generated(driver):
    log("QR", "verifying QR rendered…")
    wait_visible(driver, By.CSS_SELECTOR, "#qrcode.show img, #qrcode.show canvas")
    log("QR", "rendered ✓")


def test_save_snapshot(driver):
    log("SNAP", "saving snapshot (Save & start new)…")

    # confirm() dialog handler — auto-accept
    driver.execute_script("window.confirm = function () { return true; };")

    btn = wait_clickable(driver, By.ID, "saveSnapshotBtn")
    btn.click()

    # Snapshot list shows at least one row
    items = WebDriverWait(driver, WAIT_TIMEOUT).until(
        lambda d: d.find_elements(By.CSS_SELECTOR, "#snapshotList .snapshot-item")
    )
    assert len(items) >= 1, "Snapshot was not created"
    snap_id = items[0].find_element(By.CLASS_NAME, "snap-id").text
    log("SNAP", f"saved: {snap_id} ✓")
    return snap_id


def test_profile_menu_shows_token(driver, expected_token, expected_username):
    log("MENU", "opening profile dropdown…")
    wait_clickable(driver, By.ID, "userPill").click()
    wait_visible(driver, By.ID, "profileMenu")

    shown_token = driver.find_element(By.ID, "pmToken").text.strip()
    shown_user = driver.find_element(By.ID, "pmUsername").text.strip()
    assert shown_token == expected_token, f"Token mismatch: {shown_token} vs {expected_token}"
    assert shown_user.lower() == expected_username.lower(), f"Username mismatch: {shown_user} vs {expected_username}"
    log("MENU", f"username={shown_user} token={shown_token} ✓")


def test_logout(driver):
    log("LOGOUT", "logging out…")
    # auto-accept the confirm() dialog
    driver.execute_script("window.confirm = function () { return true; };")

    if "hidden" in (driver.find_element(By.ID, "profileMenu").get_attribute("class") or ""):
        wait_clickable(driver, By.ID, "userPill").click()
        wait_visible(driver, By.ID, "profileMenu")

    wait_clickable(driver, By.ID, "logoutBtn").click()
    # Page reloads → welcome screen returns
    WebDriverWait(driver, WAIT_TIMEOUT).until(
        EC.visibility_of_element_located((By.ID, "welcomeScreen"))
    )
    log("LOGOUT", "welcome screen back ✓")


def test_login_with_username(driver, username):
    log("LOGIN", f"logging in with username='{username}'")
    # Switch to login tab
    wait_clickable(driver, By.CSS_SELECTOR, ".auth-tab[data-tab='login']").click()
    wait_visible(driver, By.ID, "wLoginId").send_keys(username)
    driver.find_element(By.CSS_SELECTOR, "#loginForm button[type='submit']").click()

    wait_hidden(driver, By.ID, "welcomeScreen")
    log("LOGIN", "logged in via username ✓")


def test_login_with_token(driver, token):
    log("LOGIN", f"logging in with token='{token}'")
    wait_clickable(driver, By.CSS_SELECTOR, ".auth-tab[data-tab='login']").click()
    field = wait_visible(driver, By.ID, "wLoginId")
    field.clear()
    field.send_keys(token)
    driver.find_element(By.CSS_SELECTOR, "#loginForm button[type='submit']").click()

    wait_hidden(driver, By.ID, "welcomeScreen")
    log("LOGIN", "logged in via token ✓")


def test_history_persisted(driver, expected_snap_id):
    log("CHECK", "verifying snapshot history restored…")
    items = WebDriverWait(driver, WAIT_TIMEOUT).until(
        lambda d: d.find_elements(By.CSS_SELECTOR, "#snapshotList .snapshot-item")
    )
    ids = [el.find_element(By.CLASS_NAME, "snap-id").text for el in items]
    assert expected_snap_id in ids, f"{expected_snap_id} not in history {ids}"
    log("CHECK", f"history intact ({len(ids)} snapshot(s)) ✓")


def clear_storage(driver):
    """Wipe localStorage so we start from a clean welcome screen."""
    try:
        # Need a page loaded before localStorage is accessible
        driver.execute_script("try { localStorage.clear(); } catch (e) {}")
        driver.refresh()
        # Wait for welcome screen after refresh
        wait_visible(driver, By.ID, "welcomeScreen")
    except Exception as e:
        log("STORE", f"clear failed (continuing): {e}")


# ----------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------
def main():
    print(f"\n=== LinkDrop Selenium test ===")
    print(f"Target: {TARGET.upper()}")
    print(f"URL:    {INDEX_URL}\n")
    driver = make_driver()

    try:
        driver.get(INDEX_URL)
        # Give deployed site a moment for fonts/css/qrcode lib to load
        time.sleep(1.5)

        # Fresh slate
        clear_storage(driver)

        # Test data
        name = "Test User"
        username = rand_username()      # e.g. abc12

        # 1. Signup
        token = test_signup(driver, name, username)

        # 2. Profile menu shows correct username + token
        test_profile_menu_shows_token(driver, token, username)
        # close menu by clicking outside
        driver.find_element(By.TAG_NAME, "body").click()
        time.sleep(0.3)

        # 3. Add two links
        test_add_link(driver, "ig", "My Instagram", "https://instagram.com/test")
        test_add_link(driver, "yt", "My YouTube", "https://youtube.com/@test")

        # 4. QR rendered
        test_qr_generated(driver)

        # 5. Save snapshot (transaction-id style)
        snap_id = test_save_snapshot(driver)

        # 6. Logout
        test_logout(driver)

        # 7. Login with USERNAME → verify snapshot still there
        test_login_with_username(driver, username)
        test_history_persisted(driver, snap_id)

        # 8. Logout, then login with TOKEN this time
        test_logout(driver)
        test_login_with_token(driver, token)
        test_history_persisted(driver, snap_id)

        print("\n✓ ALL TESTS PASSED\n")

    except AssertionError as e:
        print(f"\n✗ ASSERTION FAILED: {e}\n")
        raise
    except Exception as e:
        print(f"\n✗ ERROR: {type(e).__name__}: {e}\n")
        raise
    finally:
        if not HEADLESS:
            print("Browser closing in 3s…")
            time.sleep(3)
        driver.quit()


if __name__ == "__main__":
    main()
