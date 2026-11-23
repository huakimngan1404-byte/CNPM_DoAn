import pytest
from pydantic import ValidationError

from presentation.site_router import GPSData, SiteAdminForm, SiteAdminUpdate, to_site_document


def test_create_site_mapping_keeps_geojson_order_and_flat_coordinates():
    data = SiteAdminForm(
        code="test-site",
        name="Test site",
        lat=10.7687,
        lng=106.7066,
        address="Test address",
        category="Historical site",
    )

    document = to_site_document(data, data.code)

    assert document["lat"] == 10.7687
    assert document["lng"] == 106.7066
    assert document["location"] == {
        "type": "Point",
        "coordinates": [106.7066, 10.7687],
    }


def test_update_site_mapping_keeps_flat_and_geojson_coordinates_in_sync():
    data = SiteAdminUpdate(
        name="Updated site",
        lat=10.779783,
        lng=106.699018,
        address="Updated address",
        category="Historical site",
        description="A sufficiently long site description.",
    )

    document = to_site_document(data, "test-site")

    assert (document["lng"], document["lat"]) == (106.699018, 10.779783)
    assert document["location"]["coordinates"] == [106.699018, 10.779783]


def test_create_and_update_accept_negative_coordinates_in_geojson_order():
    coordinates = {
        "lat": -33.8688,
        "lng": -70.6693,
    }
    create_data = SiteAdminForm(
        code="negative-coordinate-site",
        name="Negative coordinate site",
        address="Test address",
        category="Historical site",
        **coordinates,
    )
    update_data = SiteAdminUpdate(
        name="Updated negative coordinate site",
        address="Updated address",
        category="Historical site",
        description="A sufficiently long site description.",
        **coordinates,
    )

    for data in (create_data, update_data):
        document = to_site_document(data, "negative-coordinate-site")
        assert document["lat"] == -33.8688
        assert document["lng"] == -70.6693
        assert document["location"]["coordinates"] == [-70.6693, -33.8688]


def test_gps_coordinates_enforce_geographic_ranges():
    for coordinates in (
        {"lat": -90, "lng": -180},
        {"lat": 90, "lng": 180},
    ):
        GPSData(user_id="test-user", **coordinates)

    for coordinates in (
        {"lat": -90.01, "lng": 0},
        {"lat": 0, "lng": 180.01},
    ):
        with pytest.raises(ValidationError):
            GPSData(user_id="test-user", **coordinates)
