"""
Teacher Agent — Full API Test Suite
=====================================
Usage:
    1. Open http://localhost:3000 in your browser and sign in with Google.
    2. Open browser DevTools → Console and run:
           copy(localStorage.getItem('token'))
    3. Run this script:
           python test_suite.py --token YOUR_TOKEN_HERE
       Or omit --token to be prompted interactively.

Options:
    --token TOKEN     Google OAuth access token from localStorage
    --url URL         Backend base URL (default: http://localhost:8001)
    --skip-write      Skip any tests that write to Google Classroom
    --only SECTION    Run only a specific section (e.g. --only chat)
"""

import argparse
import json
import sys
import time
import os
from datetime import datetime, timedelta

import requests

# ── colour helpers ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

PASS = f"{GREEN}✅ PASS{RESET}"
FAIL = f"{RED}❌ FAIL{RESET}"
SKIP = f"{YELLOW}⏭  SKIP{RESET}"
WARN = f"{YELLOW}⚠️  WARN{RESET}"

results: list[dict] = []


def h(title: str):
    print(f"\n{BOLD}{CYAN}{'─'*60}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'─'*60}{RESET}")


def test(name: str, fn, skip=False):
    """Run a single test and record the result."""
    if skip:
        print(f"  {SKIP}  {name}")
        results.append({"name": name, "status": "skip"})
        return None

    try:
        outcome = fn()
        if outcome is None or outcome is True:
            print(f"  {PASS}  {name}")
            results.append({"name": name, "status": "pass"})
            return outcome
        elif outcome is False:
            print(f"  {FAIL}  {name}")
            results.append({"name": name, "status": "fail", "detail": "returned False"})
            return outcome
        else:
            print(f"  {PASS}  {name}")
            results.append({"name": name, "status": "pass"})
            return outcome
    except AssertionError as e:
        msg = str(e)
        print(f"  {FAIL}  {name}")
        print(f"         {RED}{msg}{RESET}")
        results.append({"name": name, "status": "fail", "detail": msg})
        return None
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        print(f"  {FAIL}  {name}")
        print(f"         {RED}{msg}{RESET}")
        results.append({"name": name, "status": "fail", "detail": msg})
        return None


def warn(name: str, fn):
    """Run a test but only warn on failure (non-critical)."""
    try:
        outcome = fn()
        print(f"  {PASS}  {name}")
        results.append({"name": name, "status": "pass"})
        return outcome
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        print(f"  {WARN}  {name}  ({msg})")
        results.append({"name": name, "status": "warn", "detail": msg})
        return None


# ── request helpers ───────────────────────────────────────────────────────────

def get(url, token, **kwargs):
    r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=20, **kwargs)
    return r


def post(url, token, **kwargs):
    r = requests.post(url, headers={"Authorization": f"Bearer {token}"}, timeout=30, **kwargs)
    return r


def put(url, token, **kwargs):
    r = requests.put(url, headers={"Authorization": f"Bearer {token}"}, timeout=20, **kwargs)
    return r


def delete(url, token, **kwargs):
    r = requests.delete(url, headers={"Authorization": f"Bearer {token}"}, timeout=20, **kwargs)
    return r


def assert_ok(r, msg=""):
    body = ""
    try:
        body = r.json()
    except Exception:
        body = r.text[:200]
    assert r.status_code < 300, (
        f"HTTP {r.status_code} {msg}: {body}"
    )
    return body


# ══════════════════════════════════════════════════════════════════════════════
#  SECTIONS
# ══════════════════════════════════════════════════════════════════════════════

def section_health(base, token):
    h("1. HEALTH & AUTH")

    def check_health():
        r = requests.get(f"{base}/health", timeout=10)
        assert_ok(r, "health")
        data = r.json()
        assert data.get("status") == "healthy", f"unexpected: {data}"

    def check_user():
        r = get(f"{base}/auth/user", token)
        data = assert_ok(r, "auth/user")
        assert "name" in data or "email" in data, f"no name/email in {data}"
        print(f"         Logged in as: {data.get('name', data.get('email', '?'))}")
        return data

    def check_no_auth():
        r = requests.get(f"{base}/auth/user", timeout=10)
        assert r.status_code == 401, f"Expected 401, got {r.status_code}"

    test("Backend is healthy", check_health)
    user = test("Auth: /auth/user returns user info", check_user)
    test("Auth: unauthenticated request returns 401", check_no_auth)
    return user


def section_classroom(base, token, skip_write=False):
    h("2. GOOGLE CLASSROOM")
    state = {}

    def list_courses():
        r = get(f"{base}/classroom/courses", token)
        data = assert_ok(r, "courses")
        courses = data.get("courses", [])
        assert len(courses) > 0, "No courses returned — are you a teacher on any active class?"
        print(f"         Found {len(courses)} course(s): {', '.join(c['name'] for c in courses[:3])}")
        state["courses"] = courses
        state["class_id"] = courses[0]["id"]
        state["class_name"] = courses[0]["name"]
        return courses

    def get_course():
        cid = state.get("class_id")
        if not cid:
            raise AssertionError("No class_id available")
        r = get(f"{base}/classroom/courses/{cid}", token)
        data = assert_ok(r, "get course")
        assert data.get("id") == cid
        return data

    def list_assignments():
        cid = state.get("class_id")
        r = get(f"{base}/classroom/courses/{cid}/assignments", token)
        data = assert_ok(r, "assignments")
        assignments = data.get("assignments", data) if isinstance(data, dict) else data
        if isinstance(assignments, list):
            print(f"         Found {len(assignments)} assignment(s)")
            if assignments:
                state["assignment_id"] = assignments[0].get("id") or assignments[0].get("courseWorkId")
        return assignments

    def get_assignment():
        cid = state.get("class_id")
        aid = state.get("assignment_id")
        if not aid:
            raise AssertionError("No assignment_id available (class may have no assignments)")
        r = get(f"{base}/classroom/courses/{cid}/assignments/{aid}", token)
        assert_ok(r, "get assignment")

    def get_submissions():
        cid = state.get("class_id")
        aid = state.get("assignment_id")
        if not aid:
            raise AssertionError("No assignment_id available")
        r = get(f"{base}/classroom/courses/{cid}/assignments/{aid}/submissions", token)
        data = assert_ok(r, "submissions")
        subs = data.get("submissions", data) if isinstance(data, dict) else data
        print(f"         Found {len(subs) if isinstance(subs, list) else '?'} submission(s)")

    def post_announcement():
        cid = state.get("class_id")
        r = post(f"{base}/classroom/courses/{cid}/announcements", token,
                  json={"text": "[TEST] Automated test announcement — safe to delete."})
        assert_ok(r, "post announcement")

    def create_assignment():
        cid = state.get("class_id")
        r = post(f"{base}/classroom/courses/{cid}/assignments", token, json={
            "title": "[TEST] Automated Test Assignment",
            "description": "This is a test assignment created by the test suite. Safe to delete.",
            "max_points": 10,
            "publish": False,   # draft — won't notify students
        })
        data = assert_ok(r, "create assignment")
        state["created_assignment_id"] = data.get("id")
        print(f"         Created draft assignment id={data.get('id')}")

    test("List courses", list_courses)
    test("Get single course", get_course)
    test("List assignments for first course", list_assignments)
    warn("Get single assignment", get_assignment)
    warn("Get submissions for assignment", get_submissions)
    test("Post announcement to first course", post_announcement, skip=skip_write)
    test("Create draft assignment in first course", create_assignment, skip=skip_write)

    return state


def section_drive(base, token):
    h("3. GOOGLE DRIVE")

    def list_files():
        r = get(f"{base}/drive/files", token)
        data = assert_ok(r, "drive files")
        files = data.get("files", data) if isinstance(data, dict) else data
        count = len(files) if isinstance(files, list) else "?"
        print(f"         Found {count} file(s) in Drive root")
        return files

    test("List Drive files", list_files)


def section_students(base, token, class_id):
    h("4. STUDENT PROFILES & GROUPS")
    state = {}

    def list_students():
        r = get(f"{base}/students/list", token, params={"class_id": class_id})
        data = assert_ok(r, "list students")
        students = data.get("students", data) if isinstance(data, dict) else data
        count = len(students) if isinstance(students, list) else "?"
        print(f"         Found {count} student(s)")
        if isinstance(students, list) and students:
            state["student_id"] = students[0]["id"]
            state["student_name"] = students[0].get("name", "?")
        return students

    def import_roster():
        r = post(f"{base}/students/import-roster", token,
                  json={"class_id": class_id})
        data = assert_ok(r, "import roster")
        count = data.get("imported", data.get("count", "?"))
        print(f"         Imported: {count}")

    def sync_submissions():
        r = post(f"{base}/students/sync-submissions", token,
                  json={"class_id": class_id})
        assert_ok(r, "sync submissions")

    def get_student():
        sid = state.get("student_id")
        if not sid:
            raise AssertionError("No student_id (import roster first)")
        r = get(f"{base}/students/{sid}", token)
        data = assert_ok(r, "get student")
        print(f"         Student: {data.get('name', '?')}")

    def update_notes():
        sid = state.get("student_id")
        if not sid:
            raise AssertionError("No student_id")
        r = put(f"{base}/students/{sid}/notes", token,
                 json={"notes": "Test note added by automated test suite."})
        assert_ok(r, "update notes")

    def get_history():
        sid = state.get("student_id")
        if not sid:
            raise AssertionError("No student_id")
        r = get(f"{base}/students/{sid}/history", token)
        assert_ok(r, "student history")

    def create_group():
        r = post(f"{base}/students/groups", token,
                  json={"class_id": class_id, "name": "Test Group", "description": "Automated test group"})
        data = assert_ok(r, "create group")
        gid = data.get("id")
        state["group_id"] = gid
        print(f"         Created group id={gid}")

    def add_to_group():
        gid = state.get("group_id")
        sid = state.get("student_id")
        if not gid or not sid:
            raise AssertionError("Need group_id and student_id")
        r = post(f"{base}/students/groups/{gid}/members", token,
                  json={"student_id": sid})
        assert_ok(r, "add to group")

    def get_group_members():
        gid = state.get("group_id")
        if not gid:
            raise AssertionError("No group_id")
        r = get(f"{base}/students/groups/{gid}/members", token)
        data = assert_ok(r, "group members")
        members = data.get("members", data) if isinstance(data, dict) else data
        print(f"         Group has {len(members) if isinstance(members, list) else '?'} member(s)")

    def remove_from_group():
        gid = state.get("group_id")
        sid = state.get("student_id")
        if not gid or not sid:
            raise AssertionError("Need group_id and student_id")
        r = delete(f"{base}/students/groups/{gid}/members/{sid}", token)
        assert_ok(r, "remove from group")

    def delete_group():
        gid = state.get("group_id")
        if not gid:
            raise AssertionError("No group_id")
        r = delete(f"{base}/students/groups/{gid}", token)
        assert_ok(r, "delete group")

    test("Import roster from Classroom", import_roster)
    test("List students", list_students)
    warn("Sync submissions", sync_submissions)
    warn("Get single student", get_student)
    test("Update student notes", update_notes)
    warn("Get student history", get_history)
    test("Create student group", create_group)
    test("Add student to group", add_to_group)
    test("Get group members", get_group_members)
    test("Remove student from group", remove_from_group)
    test("Delete group", delete_group)

    return state


def section_corpus(base, token, class_id):
    h("5. DOCUMENT CORPUS")
    state = {}

    def list_docs():
        r = get(f"{base}/corpus/documents", token, params={"class_id": class_id})
        data = assert_ok(r, "list corpus")
        docs = data.get("documents", data) if isinstance(data, dict) else data
        count = len(docs) if isinstance(docs, list) else "?"
        print(f"         Found {count} existing document(s)")

    def upload_text():
        r = post(f"{base}/corpus/upload-text", token, json={
            "class_id": class_id,
            "title": "Test Document",
            "text": (
                "Scaffolding is an instructional technique where a teacher provides "
                "successive levels of temporary support that help students reach higher "
                "levels of comprehension. Key scaffolding strategies include think-alouds, "
                "graphic organizers, and collaborative discussion."
            ),
        })
        data = assert_ok(r, "upload text")
        doc_id = data.get("doc_id") or data.get("id")
        state["doc_id"] = doc_id
        print(f"         Uploaded doc_id={doc_id}")

    def search_corpus():
        r = get(f"{base}/corpus/search", token,
                 params={"class_id": class_id, "query": "scaffolding", "limit": 5})
        data = assert_ok(r, "search corpus")
        results_list = data.get("results", data) if isinstance(data, dict) else data
        count = len(results_list) if isinstance(results_list, list) else "?"
        print(f"         Search returned {count} result(s)")

    def get_doc_content():
        doc_id = state.get("doc_id")
        if not doc_id:
            raise AssertionError("No doc_id from upload")
        r = get(f"{base}/corpus/documents/{doc_id}/content", token,
                 params={"class_id": class_id})
        data = assert_ok(r, "doc content")
        content = data.get("content", "")
        assert "scaffolding" in content.lower(), "Expected uploaded text not found in content"

    def list_drive_files():
        r = get(f"{base}/corpus/drive-files", token)
        data = assert_ok(r, "drive files for corpus")
        files = data.get("files", data) if isinstance(data, dict) else data
        print(f"         Found {len(files) if isinstance(files, list) else '?'} Drive file(s)")
        return files

    def delete_doc():
        doc_id = state.get("doc_id")
        if not doc_id:
            raise AssertionError("No doc_id to delete")
        r = delete(f"{base}/corpus/documents/{doc_id}", token,
                    params={"class_id": class_id})
        assert_ok(r, "delete doc")

    test("List corpus documents", list_docs)
    test("Upload text document", upload_text)
    test("Search corpus", search_corpus)
    test("Get document content", get_doc_content)
    warn("List Drive files (for import)", list_drive_files)
    test("Delete document", delete_doc)

    return state


def section_chat(base, token):
    h("6. CHAT AGENT")
    state = {}

    def create_conversation():
        r = post(f"{base}/chat/conversations", token,
                  json={"title": "Automated Test Conversation"})
        data = assert_ok(r, "create conversation")
        conv_id = data.get("id")
        assert conv_id, "No conversation id returned"
        state["conv_id"] = conv_id
        print(f"         Created conversation id={conv_id}")

    def list_conversations():
        r = get(f"{base}/chat/conversations", token)
        data = assert_ok(r, "list conversations")
        convs = data.get("conversations", [])
        print(f"         Found {len(convs)} conversation(s)")

    def get_conversation():
        cid = state.get("conv_id")
        if not cid:
            raise AssertionError("No conv_id")
        r = get(f"{base}/chat/conversations/{cid}", token)
        data = assert_ok(r, "get conversation")
        assert data.get("id") == cid

    def send_message_and_stream(message: str, label: str):
        """Send a message and collect the full streamed response."""
        cid = state.get("conv_id")
        if not cid:
            raise AssertionError("No conv_id")
        r = post(f"{base}/chat/conversations/{cid}/messages", token,
                  json={"message": message}, stream=True)
        assert r.status_code == 200, f"HTTP {r.status_code}: {r.text[:300]}"

        content = ""
        tool_calls = []
        error = None
        for line in r.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8") if isinstance(line, bytes) else line
            if not line.startswith("data: "):
                continue
            try:
                data = json.loads(line[6:])
                if data["type"] == "content":
                    content += data["content"]
                elif data["type"] == "tool_call":
                    tool_calls.append(data["name"])
                elif data["type"] == "error":
                    error = data["content"]
            except json.JSONDecodeError:
                pass

        if error:
            raise AssertionError(f"Agent returned error: {error}")
        assert content.strip(), "Agent returned empty response"
        preview = content[:120].replace("\n", " ")
        print(f"         [{label}] Response: \"{preview}...\"")
        if tool_calls:
            print(f"         Tools used: {', '.join(tool_calls)}")
        return content, tool_calls

    def test_basic_qa():
        content, _ = send_message_and_stream("What classes do I have?", "basic Q&A")
        # Just needs a non-empty response
        assert len(content) > 20

    def test_roster_tool():
        content, tools = send_message_and_stream(
            "Who are my students? List the roster for my first class.", "roster tool"
        )
        assert len(content) > 10
        # Ideally calls get_class_roster — warn if not
        if "get_class_roster" not in tools:
            print(f"         {YELLOW}Note: get_class_roster not called (may have used cached context){RESET}")

    def test_assignments_tool():
        content, tools = send_message_and_stream(
            "What assignments are in my first class?", "assignments tool"
        )
        assert len(content) > 10

    def test_student_data_tool():
        content, tools = send_message_and_stream(
            "How are my students doing overall? Give me a brief summary.", "student data"
        )
        assert len(content) > 10

    def test_strategy_log():
        content, tools = send_message_and_stream(
            "I want to try using exit tickets at the end of every lesson. Please log that as a teaching strategy.",
            "strategy log"
        )
        assert len(content) > 10
        if "log_strategy" not in tools:
            print(f"         {YELLOW}Note: log_strategy not called — agent may have just acknowledged{RESET}")

    def test_ended_conversation():
        # A new ended conversation should reject messages
        r = post(f"{base}/chat/conversations", token, json={"title": "To be ended"})
        data = assert_ok(r, "create temp conv")
        tmp_id = data["id"]

        # End it
        r2 = post(f"{base}/chat/conversations/{tmp_id}/end", token)
        assert_ok(r2, "end conversation")

        # Now try to send a message — should get 400
        r3 = post(f"{base}/chat/conversations/{tmp_id}/messages", token,
                   json={"message": "hello"})
        assert r3.status_code == 400, f"Expected 400 for ended conversation, got {r3.status_code}"

    def end_conversation():
        cid = state.get("conv_id")
        if not cid:
            raise AssertionError("No conv_id")
        r = post(f"{base}/chat/conversations/{cid}/end", token)
        data = assert_ok(r, "end conversation")
        summary = data.get("summary", "")
        if summary:
            print(f"         Summary: \"{summary[:100]}...\"")
        else:
            print(f"         (No summary generated)")

    def delete_conversation():
        # Create a throwaway conversation and delete it
        r = post(f"{base}/chat/conversations", token, json={"title": "To delete"})
        data = assert_ok(r, "create for delete")
        tmp_id = data["id"]
        r2 = delete(f"{base}/chat/conversations/{tmp_id}", token)
        assert_ok(r2, "delete conversation")

    test("Create conversation", create_conversation)
    test("List conversations", list_conversations)
    test("Get conversation by ID", get_conversation)
    test("Send message — basic Q&A (streaming)", test_basic_qa)
    test("Send message — roster tool", test_roster_tool)
    test("Send message — assignments tool", test_assignments_tool)
    test("Send message — student data tool", test_student_data_tool)
    test("Send message — log teaching strategy", test_strategy_log)
    test("Ended conversation rejects new messages", test_ended_conversation)
    test("End conversation (triggers summarization)", end_conversation)
    test("Delete conversation", delete_conversation)

    return state


def section_agent(base, token, class_id):
    h("7. AI CONTENT GENERATOR (/agent)")

    def generate_assignment():
        r = post(f"{base}/agent/generate", token, json={
            "topic": "The water cycle",
            "class_id": class_id,
            "assignment_type": "worksheet",
            "additional_instructions": "Keep it brief — this is a test.",
        })
        data = assert_ok(r, "generate assignment")
        content = data.get("content") or data.get("assignment") or str(data)
        assert len(content) > 50, f"Generated content too short: {content[:100]}"
        print(f"         Generated {len(content)} chars")
        return content

    def ask_question():
        r = post(f"{base}/agent/ask", token,
                  json={"question": "What is Bloom's Taxonomy?"})
        data = assert_ok(r, "ask question")
        answer = data.get("answer") or data.get("content") or str(data)
        assert len(answer) > 20, f"Answer too short: {answer}"
        print(f"         Answer: \"{str(answer)[:100]}\"")

    def improve_assignment():
        r = post(f"{base}/agent/improve", token, json={
            "assignment_text": "Write a paragraph about the water cycle."
        })
        data = assert_ok(r, "improve assignment")
        improved = data.get("improved") or data.get("content") or str(data)
        assert len(improved) > 20
        print(f"         Improved text: \"{str(improved)[:100]}\"")

    test("Generate assignment content", generate_assignment)
    test("Ask a pedagogical question", ask_question)
    test("Improve existing assignment text", improve_assignment)


def section_scheduled_posts(base, token, class_id, skip_write=False):
    h("8. SCHEDULED POSTS")
    state = {}

    def create_post():
        r = post(f"{base}/scheduled-posts/create", token, json={
            "class_id": class_id,
            "post_type": "announcement",
            "title": "[TEST] Weekly Reminder",
            "content": "This is an automated test scheduled post. Safe to delete.",
            "frequency": "weekly",
            "day_of_week": 0,   # Monday
            "time_of_day": "08:00",
        })
        data = assert_ok(r, "create scheduled post")
        pid = data.get("id")
        state["post_id"] = pid
        print(f"         Created scheduled post id={pid}")

    def list_posts():
        r = get(f"{base}/scheduled-posts/list", token, params={"class_id": class_id})
        data = assert_ok(r, "list scheduled posts")
        posts = data.get("posts", data) if isinstance(data, dict) else data
        count = len(posts) if isinstance(posts, list) else "?"
        print(f"         Found {count} scheduled post(s)")

    def toggle_post():
        pid = state.get("post_id")
        if not pid:
            raise AssertionError("No post_id")
        r = post(f"{base}/scheduled-posts/{pid}/toggle", token)
        data = assert_ok(r, "toggle scheduled post")
        status = data.get("active", "?")
        print(f"         Toggled — active={status}")

    def update_post():
        pid = state.get("post_id")
        if not pid:
            raise AssertionError("No post_id")
        r = put(f"{base}/scheduled-posts/{pid}", token,
                 json={"title": "[TEST] Weekly Reminder — Updated"})
        assert_ok(r, "update scheduled post")

    def post_now():
        pid = state.get("post_id")
        if not pid:
            raise AssertionError("No post_id")
        r = post(f"{base}/scheduled-posts/{pid}/post-now", token)
        data = assert_ok(r, "post now")
        print(f"         Posted now: {data}")

    def delete_post():
        pid = state.get("post_id")
        if not pid:
            raise AssertionError("No post_id")
        r = delete(f"{base}/scheduled-posts/{pid}", token)
        assert_ok(r, "delete scheduled post")

    test("Create scheduled post", create_post)
    test("List scheduled posts", list_posts)
    test("Toggle scheduled post on/off", toggle_post)
    test("Update scheduled post", update_post)
    test("Post-now (sends immediately to Classroom)", post_now, skip=skip_write)
    test("Delete scheduled post", delete_post)

    return state


def section_linked_classes(base, token, classes):
    h("9. LINKED CLASSES")
    state = {}

    if len(classes) < 2:
        print(f"  {SKIP}  Need at least 2 courses to test linked classes (found {len(classes)})")
        results.append({"name": "Linked classes (all)", "status": "skip"})
        return state

    cid1 = classes[0]["id"]
    cid2 = classes[1]["id"]

    def list_links():
        r = get(f"{base}/linked-classes/list", token)
        data = assert_ok(r, "list links")
        links = data.get("links", data) if isinstance(data, dict) else data
        print(f"         Existing links: {len(links) if isinstance(links, list) else '?'}")

    def create_link():
        r = post(f"{base}/linked-classes/create", token,
                  json={"class_id_a": cid1, "class_id_b": cid2, "label": "Test Link"})
        data = assert_ok(r, "create link")
        lid = data.get("id")
        state["link_id"] = lid
        print(f"         Linked {cid1} ↔ {cid2}, link id={lid}")

    def update_link():
        lid = state.get("link_id")
        if not lid:
            raise AssertionError("No link_id")
        r = put(f"{base}/linked-classes/{lid}", token, json={"label": "Updated Test Link"})
        assert_ok(r, "update link")

    def delete_link():
        lid = state.get("link_id")
        if not lid:
            raise AssertionError("No link_id")
        r = delete(f"{base}/linked-classes/{lid}", token)
        assert_ok(r, "delete link")

    test("List class links", list_links)
    test("Create class link", create_link)
    test("Update class link label", update_link)
    test("Delete class link", delete_link)

    return state


# ══════════════════════════════════════════════════════════════════════════════
#  SUMMARY
# ══════════════════════════════════════════════════════════════════════════════

def print_summary():
    h("TEST SUMMARY")
    passed = [r for r in results if r["status"] == "pass"]
    failed = [r for r in results if r["status"] == "fail"]
    warned = [r for r in results if r["status"] == "warn"]
    skipped = [r for r in results if r["status"] == "skip"]

    total = len(results)
    print(f"\n  Total:   {total}")
    print(f"  {GREEN}Passed:  {len(passed)}{RESET}")
    print(f"  {RED}Failed:  {len(failed)}{RESET}")
    print(f"  {YELLOW}Warned:  {len(warned)}{RESET}")
    print(f"  {YELLOW}Skipped: {len(skipped)}{RESET}")

    if failed:
        print(f"\n{RED}{BOLD}  Failures:{RESET}")
        for r in failed:
            print(f"    ❌ {r['name']}")
            if r.get("detail"):
                print(f"       {r['detail']}")

    if warned:
        print(f"\n{YELLOW}{BOLD}  Warnings:{RESET}")
        for r in warned:
            print(f"    ⚠️  {r['name']}")
            if r.get("detail"):
                print(f"       {r['detail']}")

    if skipped:
        print(f"\n{YELLOW}{BOLD}  Skipped:{RESET}")
        for r in skipped:
            print(f"    ⏭  {r['name']}")

    print()

    # Write JSON report
    report_path = os.path.join(os.path.dirname(__file__), "test_report.json")
    with open(report_path, "w") as f:
        json.dump({
            "run_at": datetime.now().isoformat(),
            "summary": {
                "total": total,
                "passed": len(passed),
                "failed": len(failed),
                "warned": len(warned),
                "skipped": len(skipped),
            },
            "results": results,
        }, f, indent=2)
    print(f"  Report written to: {report_path}")

    return len(failed) == 0


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════════════════════════════

SECTIONS = ["health", "classroom", "drive", "students", "corpus", "chat", "agent",
            "scheduled_posts", "linked_classes"]


def main():
    parser = argparse.ArgumentParser(description="Teacher Agent test suite")
    parser.add_argument("--token", help="Google OAuth access token (from localStorage)")
    parser.add_argument("--url", default="http://localhost:8001", help="Backend URL")
    parser.add_argument("--skip-write", action="store_true",
                        help="Skip tests that write to Google Classroom")
    parser.add_argument("--only", choices=SECTIONS,
                        help="Run only one section")
    args = parser.parse_args()

    token = args.token
    if not token:
        print(f"\n{BOLD}How to get your token:{RESET}")
        print("  1. Open http://localhost:3000 and sign in")
        print("  2. Open DevTools → Console")
        print("  3. Run: copy(localStorage.getItem('token'))")
        print("  4. Paste it below\n")
        token = input("Paste your token: ").strip()
        if not token:
            print("No token provided. Exiting.")
            sys.exit(1)

    base = args.url.rstrip("/")
    skip_write = args.skip_write
    only = args.only

    print(f"\n{BOLD}Teacher Agent Test Suite{RESET}")
    print(f"  Backend: {base}")
    print(f"  Skip Classroom writes: {skip_write}")
    if only:
        print(f"  Running only: {only}")
    print()

    # ── run sections ──────────────────────────────────────────────────────────
    class_id = None
    classes = []

    if not only or only == "health":
        section_health(base, token)

    if not only or only == "classroom":
        state = section_classroom(base, token, skip_write=skip_write)
        class_id = state.get("class_id")
        classes = state.get("courses", [])

    if not only or only == "drive":
        section_drive(base, token)

    if class_id:
        if not only or only == "students":
            section_students(base, token, class_id)

        if not only or only == "corpus":
            section_corpus(base, token, class_id)

        if not only or only == "agent":
            section_agent(base, token, class_id)

        if not only or only == "scheduled_posts":
            section_scheduled_posts(base, token, class_id, skip_write=skip_write)
    else:
        if only in ("students", "corpus", "agent", "scheduled_posts"):
            print(f"{RED}Cannot run {only} section — no class_id available. Run classroom section first.{RESET}")

    if not only or only == "chat":
        section_chat(base, token)

    if not only or only == "linked_classes":
        section_linked_classes(base, token, classes)

    success = print_summary()
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
