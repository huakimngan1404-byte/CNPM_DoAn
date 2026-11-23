import math
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from business.site_service import SiteService


def latitude_offset(meters):
    return math.degrees(meters / 6_371_000)


def create_service(site):
    active_sites = {}
    events = []
    service = SiteService()
    service.catalog_seeded = True
    service.repo = SimpleNamespace(
        get_all_sites=AsyncMock(return_value=[site]),
        get_active_geofence=AsyncMock(
            side_effect=lambda user_id: active_sites.get(user_id)
        ),
        set_active_geofence=AsyncMock(
            side_effect=lambda user_id, site_id: (
                active_sites.pop(user_id, None)
                if site_id is None
                else active_sites.__setitem__(user_id, site_id)
            )
        ),
    )
    service.publish_event = lambda user_id, site_id, lang: events.append(user_id)
    return service, events


@pytest.mark.asyncio
async def test_process_gps_uses_site_specific_geofence_radius():
    service, _ = create_service({
        "_id": "site-1",
        "name": "Test site",
        "location": {"coordinates": [0, 0]},
        "geofence_radius": 50,
    })

    result = await service.process_gps(
        "visitor-1", latitude_offset(60), 0, "vi"
    )

    assert result == {"in_zone": False, "trigger": False}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "radius",
    [None, float("nan"), 0, 1001, "50", True],
)
async def test_process_gps_defaults_invalid_geofence_radius_to_100(radius):
    service, _ = create_service({
        "_id": "site-1",
        "name": "Test site",
        "location": {"coordinates": [0, 0]},
        "geofence_radius": radius,
    })

    result = await service.process_gps(
        "visitor-1", latitude_offset(75), 0, "vi"
    )

    assert result["in_zone"] is True


@pytest.mark.asyncio
async def test_process_gps_tracks_geofence_entries_per_visitor():
    service, events = create_service({
        "_id": "site-1",
        "name": "Test site",
        "location": {"coordinates": [0, 0]},
        "geofence_radius": 50,
    })

    first_visitor = await service.process_gps(
        "visitor-1", latitude_offset(40), 0, "vi"
    )
    second_visitor = await service.process_gps(
        "visitor-2", latitude_offset(40), 0, "vi"
    )
    repeated_first_visitor = await service.process_gps(
        "visitor-1", latitude_offset(40), 0, "vi"
    )

    assert first_visitor["trigger"] is True
    assert second_visitor["trigger"] is True
    assert repeated_first_visitor["trigger"] is False
    assert events == ["visitor-1", "visitor-2"]
