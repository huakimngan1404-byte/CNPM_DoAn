from presentation.site_router import SiteAdminForm, SiteAdminUpdate, to_site_document


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
