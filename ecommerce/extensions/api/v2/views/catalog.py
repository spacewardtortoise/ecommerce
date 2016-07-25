import logging

from oscar.core.loading import get_model
from requests.exceptions import ConnectionError, Timeout
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, IsAdminUser
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet
from rest_framework_extensions.decorators import action
from rest_framework_extensions.mixins import NestedViewSetMixin
from slumber.exceptions import SlumberBaseException

from ecommerce.core.constants import DEFAULT_CATALOG_PAGE_SIZE
from ecommerce.courses.models import Course
from ecommerce.extensions.api import serializers


Catalog = get_model('catalogue', 'Catalog')
logger = logging.getLogger(__name__)


class CatalogViewSet(NestedViewSetMixin, ReadOnlyModelViewSet):
    queryset = Catalog.objects.all()
    serializer_class = serializers.CatalogSerializer
    permission_classes = (IsAuthenticated, IsAdminUser,)

    @action(is_for_list=True, methods=['get'])
    def preview(self, request):
        """
        Preview the results of the catalog query.
        A list of course runs, indicating a course run presence within the catalog, will be returned.
        ---
        parameters:
            - name: query
              description: Elasticsearch querystring query
              required: true
              type: string
              paramType: query
              multiple: false
        """
        query = request.GET.get('query')
        seat_types = request.GET.get('seat_types')
        offset = request.GET.get('offset')
        limit = request.GET.get('limit', DEFAULT_CATALOG_PAGE_SIZE)

        if query and seat_types:
            seat_types = seat_types.split(',')
            try:
                client = request.site.siteconfiguration.course_catalog_api_client
                response = client.course_runs.get(
                    q=query,
                    limit=limit,
                    offset=offset
                )
                results = response['results']
                course_ids = [result['key'] for result in results]
                courses = serializers.CourseSerializer(
                    Course.objects.filter(id__in=course_ids),
                    many=True,
                    context={'request': request}
                ).data
                data = {
                    'next': response['next'],
                    'courses': [course for course in courses if course['type'] in seat_types]
                }
                return Response(data=data)
            except (ConnectionError, SlumberBaseException, Timeout):
                logger.error('Unable to connect to Course Catalog service.')
                return Response(status=status.HTTP_400_BAD_REQUEST)
        return Response(status=status.HTTP_400_BAD_REQUEST)
