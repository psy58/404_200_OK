#!/usr/bin/env python3 -m pytest
"""창으로 띄우는 실행 파일.

창을 실제로 열지는 않는다. 창이 뜨기 전에 갖춰져야 하는 것만 확인한다.
"""

import socket

import desktop


def test_picks_a_port_that_is_free() -> None:
    """이미 서버를 띄워 두었어도 부딪히지 않아야 한다."""
    port = desktop.find_free_port()
    assert 1024 < port < 65536

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", port))  # 비어 있으므로 묶을 수 있다


def test_two_calls_do_not_hand_out_the_same_port() -> None:
    assert desktop.find_free_port() != desktop.find_free_port()


def test_url_points_at_this_machine_only() -> None:
    """바깥에서 접근할 수 있으면 안 된다. 개인 문서를 다루는 프로그램이다."""
    server = desktop.BackgroundServer(12345)
    assert server.url == "http://127.0.0.1:12345"


def test_stopping_a_server_that_never_started_is_safe() -> None:
    desktop.BackgroundServer(desktop.find_free_port()).stop()


def test_waiting_gives_up_instead_of_hanging() -> None:
    """서버가 뜨지 않으면 창을 열지 않고 안내를 내보내야 한다."""
    server = desktop.BackgroundServer(desktop.find_free_port())
    assert server.wait_until_ready(timeout=0.5) is False
