<?php

namespace Pim\Bundle\ClassificationBundle\Doctrine\ORM\Repository;

use Doctrine\Common\Util\ClassUtils;
use Doctrine\ORM\EntityManager;
use Doctrine\ORM\QueryBuilder;
use Pim\Component\Classification\Model\CategoryInterface;
use Pim\Component\Classification\Repository\CategoryFilterableRepositoryInterface;
use Pim\Component\Classification\Repository\ItemCategoryRepositoryInterface;

/**
 * Item category repository
 *
 * @author Adrien Pétremann <adrien.petremann@akeneo.com>
 * @copyright 2015 Akeneo SAS (http://www.akeneo.com)
 * @license   http://opensource.org/licenses/osl-3.0.php  Open Software License (OSL 3.0)
 */
abstract class ItemCategoryRepository implements ItemCategoryRepositoryInterface, CategoryFilterableRepositoryInterface
{
    /** @var string */
    protected $entityName;

    /** @var EntityManager */
    protected $em;

    /**
     * @param EntityManager $em
     * @param string        $entityName
     */
    public function __construct(EntityManager $em, $entityName)
    {
        $this->em         = $em;
        $this->entityName = $entityName;
    }

    /**
     * {@inherit}
     */
    public function getItemCountByTree($item)
    {
        $itemMetadata = $this->em->getClassMetadata(ClassUtils::getClass($item));

        $categoryAssoc = $itemMetadata->getAssociationMapping('categories');
        $categoryClass = $categoryAssoc['targetEntity'];
        $categoryTable = $this->em->getClassMetadata($categoryClass)->getTableName();
        $categoryAssocTable = $categoryAssoc['joinTable']['name'];
        $relation = key($categoryAssoc['relationToSourceKeyColumns']);

        $sql = "SELECT tree.id AS tree_id, COUNT(category_item.$relation) AS item_count " .
               "FROM $categoryTable tree " .
               "JOIN $categoryTable category ON category.root = tree.id " .
               "LEFT JOIN $categoryAssocTable category_item ON category_item.category_id = category.id " .
               "AND category_item.$relation = :itemId " .
               "GROUP BY tree.id";

        $stmt = $this->em->getConnection()->prepare($sql);
        $stmt->bindValue('itemId', $item->getId());

        $stmt->execute();
        $itemCounts = $stmt->fetchAll();

        $trees = [];
        foreach ($itemCounts as $itemCount) {
            $trees[] = [
                'itemCount' => $itemCount['item_count'],
                'tree'      => $this->em->getRepository($categoryClass)->find($itemCount['tree_id']),
            ];
        }

        return $trees;
    }

    /**
     * {@inherit}
     */
    public function getItemIdsInCategory(CategoryInterface $category, QueryBuilder $categoryQb = null)
    {
        $qb = $this->em->createQueryBuilder();
        $qb->select('DISTINCT a.id');
        $qb->from($this->entityName, 'a', 'a.id');
        $qb->join('a.categories', 'node');

        if (null === $categoryQb) {
            $qb->where('node.id = :nodeId');
            $qb->setParameter('nodeId', $category->getId());
        } else {
            $qb->where($categoryQb->getDqlPart('where'));
            $qb->setParameters($categoryQb->getParameters());
        }

        $assets = $qb->getQuery()->execute([], AbstractQuery::HYDRATE_ARRAY);

        return array_keys($assets);
    }

    /**
     * {@inherit}
     */
    public function getItemsCountInCategory(CategoryInterface $category, QueryBuilder $categoryQb = null)
    {
        $qb = $this->em->createQueryBuilder();
        $qb->select($qb->expr()->count('distinct p'));
        $qb->from($this->entityName, 'p');
        $qb->join('p.categories', 'node');

        if (null === $categoryQb) {
            $qb->where('node.id = :nodeId');
            $qb->setParameter('nodeId', $category->getId());
        } else {
            $qb->where($categoryQb->getDqlPart('where'));
            $qb->setParameters($categoryQb->getParameters());
        }

        return $qb->getQuery()->getSingleScalarResult();
    }

    /**
     * {@inheritdoc}
     */
    public function applyFilterByUnclassified($qb)
    {
        $rootAlias = $qb->getRootAlias();
        $alias     = uniqid('filterCategory');

        $qb->leftJoin($rootAlias . '.categories', $alias);
        $qb->andWhere($qb->expr()->isNull($alias . '.id'));
    }

    /**
     * {@inheritdoc}
     */
    public function applyFilterByCategoryIds($qb, array $categoryIds, $include = true)
    {
        $rootAlias    = $qb->getRootAlias();
        $alias        = uniqid('filterCategory');
        $filterCatIds = uniqid('filterCatIds');

        if ($include) {
            $qb->leftJoin($rootAlias.'.categories', $alias);
            $qb->andWhere($qb->expr()->in($alias.'.id', ':' . $filterCatIds));
            $qb->groupBy($rootAlias.'.id');
        } else {
            $rootAliasIn = uniqid($rootAlias);
            $rootEntity = current($qb->getRootEntities());
            $qbIn = $qb->getEntityManager()->createQueryBuilder();
            $qbIn
                ->select($rootAliasIn.'.id')
                ->from($rootEntity, $rootAliasIn, $rootAliasIn . '.id')
                ->leftJoin($rootAliasIn . '.categories', $alias)
                ->where($qbIn->expr()->in($alias . '.id', ':' . $filterCatIds));

            $qb->andWhere($qb->expr()->notIn($rootAlias . '.id', $qbIn->getDQL()));
            $qb->groupBy($rootAlias.'.id');
        }
        $qb->setParameter($filterCatIds, $categoryIds);
    }

    /**
     * {@inheritdoc}
     */
    public function applyFilterByCategoryIdsOrUnclassified($qb, array $categoryIds)
    {
        $rootAlias    = $qb->getRootAlias();
        $alias        = uniqid('filterCategory');
        $filterCatIds = uniqid('filterCatIdsOrUnclassified');

        $qb->leftJoin($rootAlias . '.categories', $alias);
        $qb->andWhere(
            $qb->expr()->orX(
                $qb->expr()->in($alias . '.id', ':' . $filterCatIds),
                $qb->expr()->isNull($alias . '.id')
            )
        );
        $qb->setParameter($filterCatIds, $categoryIds);
    }
}
