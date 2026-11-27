from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from business.site_service import SiteService


NOTRE_DAME = {
    "code": "nha-tho-duc-ba-sai-gon",
    "name": "Nhà thờ Đức Bà Sài Gòn",
    "geofence_radius": 30,
    "location": {
        "type": "Point",
        "coordinates": [106.699018, 10.779783],
    },
}


def create_service(sites):
    stored_sites = deepcopy(sites)
    service = SiteService()
    service.catalog_seeded = True
    service.repo = SimpleNamespace(
        get_all_sites=AsyncMock(side_effect=lambda: stored_sites),
        get_site_by_code=AsyncMock(
            side_effect=lambda code: next(
                (site for site in stored_sites if site["code"] == code),
                None,
            )
        ),
        create_site=AsyncMock(
            side_effect=lambda site: stored_sites.append(deepcopy(site))
        ),
        update_site=AsyncMock(
            side_effect=lambda code, changes: next(
                site.update(changes)
                for site in stored_sites
                if site["code"] == code
            )
        ),
    )
    return service, stored_sites


def site_document(code, name, latitude, longitude, radius):
    return {
        "code": code,
        "name": name,
        "geofence_radius": radius,
        "location": {
            "type": "Point",
            "coordinates": [longitude, latitude],
        },
    }


@pytest.mark.asyncio
async def test_add_site_rejects_overlapping_geofence_without_persisting():
    service, stored_sites = create_service([NOTRE_DAME])
    post_office = site_document(
        "buu-dien-trung-tam-sai-gon",
        "Bưu điện Trung tâm Sài Gòn",
        10.779830,
        106.699970,
        100,
    )

    with pytest.raises(ValueError, match="Nhà thờ Đức Bà Sài Gòn"):
        await service.add_site(post_office)

    assert len(stored_sites) == 1
    service.repo.create_site.assert_not_awaited()


@pytest.mark.asyncio
async def test_add_site_accepts_non_overlapping_geofence_and_saves_radius():
    service, stored_sites = create_service([NOTRE_DAME])
    post_office = site_document(
        "buu-dien-trung-tam-sai-gon",
        "Bưu điện Trung tâm Sài Gòn",
        10.779830,
        106.699970,
        30,
    )

    await service.add_site(post_office)

    assert len(stored_sites) == 2
    assert stored_sites[1]["geofence_radius"] == 30
    service.repo.create_site.assert_awaited_once()


@pytest.mark.asyncio
async def test_update_site_rejects_overlap_with_other_site():
    existing_site = site_document(
        "buu-dien-trung-tam-sai-gon",
        "Bưu điện Trung tâm Sài Gòn",
        10.770,
        106.690,
        30,
    )
    service, stored_sites = create_service([NOTRE_DAME, existing_site])
    changes = site_document(
        "buu-dien-trung-tam-sai-gon",
        "Bưu điện Trung tâm Sài Gòn",
        10.779830,
        106.699970,
        100,
    )

    with pytest.raises(ValueError, match="Nhà thờ Đức Bà Sài Gòn"):
        await service.update_site("buu-dien-trung-tam-sai-gon", changes)

    assert stored_sites[1]["location"] == existing_site["location"]
    service.repo.update_site.assert_not_awaited()


@pytest.mark.asyncio
async def test_updating_geofence_radius_rejects_overlap():
    post_office = site_document(
        "buu-dien-trung-tam-sai-gon",
        "Bưu điện Trung tâm Sài Gòn",
        10.779830,
        106.699970,
        30,
    )
    service, stored_sites = create_service([NOTRE_DAME, post_office])

    with pytest.raises(ValueError, match="Nhà thờ Đức Bà Sài Gòn"):
        await service.update_geofence_radius("buu-dien-trung-tam-sai-gon", 100)

    assert stored_sites[1]["geofence_radius"] == 30
    service.repo.update_site.assert_not_awaited()
