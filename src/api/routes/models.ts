import _ from 'lodash';

export default {

    prefix: '/v1',

    get: {
        '/models': async () => {
            return {
                "data": [
                    {
                        "id": "glm-3-turbo",
                        "object": "model",
                        "owned_by": "glm-free-api"
                    },
                    {
                        "id": "glm-4",
                        "object": "model",
                        "owned_by": "glm-free-api"
                    },
                    {
                        "id": "glm-4v",
                        "object": "model",
                        "owned_by": "glm-free-api"
                    },
                    {
                        "id": "glm-v1",
                        "object": "model",
                        "owned_by": "glm-free-api"
                    },
                    {
                        "id": "glm-v1-vision",
                        "object": "model",
                        "owned_by": "glm-free-api"
                    }
                ]
            };
        }

    }
}