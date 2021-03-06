define([
        'models/course_seats/course_seat'
    ],
    function (CourseSeat) {
        'use strict';

        return CourseSeat.extend({
            defaults: _.extend({}, CourseSeat.prototype.defaults,
                {
                    certificate_type: 'verified',
                    id_verification_required: true,
                    price: 100
                }
            )
        }, {seatType: 'verified'});
    }
);
